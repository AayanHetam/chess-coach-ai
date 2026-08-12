"use client";

import { memo } from "react";
import {
  GLYPH,
  LIGHT_SQ,
  DARK_SQ,
  WHITE_PIECE,
  BLACK_PIECE,
  EMBER,
  QUIET,
} from "./diagramTokens";

/**
 * Illustrations for the quiz steps that aren't a chess position.
 *
 * The board motif carries through deliberately: every scene is built from the
 * same squares and the same glyph set as `TacticDiagram`, so the quiz reads as
 * one designed thing rather than a diagram step wedged between icon steps.
 *
 * All pure SVG on a 100×100 viewBox — no icon font, no images, no dependency.
 */

export type QuizIconName =
  // "How do you currently play?"
  | "online"
  | "otb"
  | "new"
  // Self-assessment scales: a rank the player would recognise.
  | "level-0"
  | "level-1"
  | "level-2"
  // Daily time budget.
  | "time-low"
  | "time-mid"
  | "time-high";

const SURFACE = "rgba(255,255,255,0.05)";
const EDGE = "rgba(255,255,255,0.12)";

/** A 2×2 board crop, used as the base of the play-style scenes. */
function MiniBoard({ x, y, s }: { x: number; y: number; s: number }) {
  const c = s / 2;
  return (
    <g>
      {[0, 1].map((col) =>
        [0, 1].map((row) => (
          <rect
            key={`${col}${row}`}
            x={x + col * c}
            y={y + row * c}
            width={c}
            height={c}
            fill={(col + row) % 2 === 0 ? LIGHT_SQ : DARK_SQ}
          />
        ))
      )}
    </g>
  );
}

function Piece({ x, y, size, glyph, side }: { x: number; y: number; size: number; glyph: keyof typeof GLYPH; side: "w" | "b" }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fill={side === "w" ? WHITE_PIECE : BLACK_PIECE}
      style={{ userSelect: "none" }}
    >
      {GLYPH[glyph]}
    </text>
  );
}

/**
 * The self-assessment scales run pawn → knight → queen.
 *
 * A chess player reads that ordering instantly, which an abstract bar chart
 * does not give you — and it keeps the whole quiz inside one vocabulary. The
 * score these map to (0/1/2) is the same one `selfAssessScore` sums, so the
 * picture and the maths agree by construction.
 */
const LEVEL_PIECE = ["pawn", "knight", "queen"] as const;

function scene(name: QuizIconName) {
  switch (name) {
    // A board on a screen. Deliberately ONE bold shape plus the board — an
    // earlier version added a monitor stand and extra pieces and read as noise
    // at this size. Screenshotting is what caught that.
    case "online":
      return (
        <>
          <rect x={6} y={12} width={88} height={68} rx={9} fill={SURFACE} stroke={EDGE} strokeWidth={3} />
          <MiniBoard x={20} y={22} s={48} />
          <Piece x={32} y={34} size={22} glyph="knight" side="w" />
          <Piece x={56} y={58} size={22} glyph="pawn" side="b" />
          <rect x={38} y={84} width={24} height={5} rx={2.5} fill={QUIET} />
        </>
      );

    // Two kings facing across a board. The kings alone say "two players" —
    // the earlier side-dots version just added clutter.
    case "otb":
      return (
        <>
          <MiniBoard x={14} y={14} s={72} />
          <Piece x={32} y={32} size={30} glyph="king" side="w" />
          <Piece x={68} y={68} size={30} glyph="king" side="b" />
        </>
      );

    // One pawn, one spark: the very beginning.
    case "new":
      return (
        <>
          <MiniBoard x={14} y={14} s={72} />
          <Piece x={38} y={64} size={34} glyph="pawn" side="w" />
          {/* A four-point sparkle, not a plus — a plus reads as "add". */}
          <path
            d="M68 24 L71.5 33.5 L81 37 L71.5 40.5 L68 50 L64.5 40.5 L55 37 L64.5 33.5 Z"
            fill={EMBER}
          />
        </>
      );

    case "level-0":
    case "level-1":
    case "level-2": {
      const idx = Number(name.slice(-1)) as 0 | 1 | 2;
      return (
        <>
          <rect x={18} y={18} width={64} height={64} rx={12} fill={SURFACE} stroke={EDGE} strokeWidth={2} />
          <Piece x={50} y={50} size={40} glyph={LEVEL_PIECE[idx]} side="w" />
        </>
      );
    }

    case "time-low":
    case "time-mid":
    case "time-high": {
      // A clock face whose ember arc grows with the commitment. Fraction is
      // illustrative of the tier, not a literal share of the day.
      const frac = name === "time-low" ? 0.16 : name === "time-mid" ? 0.42 : 0.78;
      const r = 30;
      const circ = 2 * Math.PI * r;
      return (
        <>
          <circle cx={50} cy={50} r={r} fill={SURFACE} stroke={EDGE} strokeWidth={3} />
          <circle
            cx={50}
            cy={50}
            r={r}
            fill="none"
            stroke={EMBER}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={`${circ * frac} ${circ}`}
            transform="rotate(-90 50 50)"
          />
          {/* Hands are ANGLED and of different lengths on purpose: a vertical
              hand plus a horizontal one reads as the letter L, not a clock.
              Caught by looking at the rendered icon. */}
          <line x1={50} y1={50} x2={39} y2={41} stroke={WHITE_PIECE} strokeWidth={3.4} strokeLinecap="round" />
          <line x1={50} y1={50} x2={63} y2={34} stroke={WHITE_PIECE} strokeWidth={3} strokeLinecap="round" />
          <circle cx={50} cy={50} r={2.6} fill={WHITE_PIECE} />
        </>
      );
    }
  }
}

function QuizIcon({ name, px = 56, title }: { name: QuizIconName; px?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={px}
      height={px}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: "block", flexShrink: 0 }}
    >
      {scene(name)}
    </svg>
  );
}

export default memo(QuizIcon);
