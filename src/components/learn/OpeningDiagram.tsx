"use client";

import { memo, useMemo } from "react";
import { Chess } from "chess.js";
import {
  BLACK_PIECE,
  DARK_SQ,
  EMBER,
  GLYPH,
  LIGHT_SQ,
  WHITE_PIECE,
  type Glyph,
} from "@/components/onboarding/diagramTokens";

/**
 * The position an opening actually produces, as a small inline board.
 *
 * A name is not a picture. "Grünfeld Defence" means nothing to the player this
 * page is for, and the position does — so every choice on /learn shows what it
 * turns into rather than asking them to recognise a word.
 *
 * Built from `diagramTokens`, the same squares and the same filled glyph set as
 * the onboarding quiz's `TacticDiagram` and `QuizIcon`, so the two surfaces read
 * as one designed thing rather than two people's illustrations. Pure SVG on a
 * fixed 100×100 viewBox: no chessground, no images, no dependency, scales for
 * free, and cheap enough to put twenty of them on a page.
 *
 * Eight squares rather than the quiz's four. A four-square crop is enough to
 * show a fork; an opening is recognised by its whole pawn shape, and cropping it
 * would show every 1.d4 opening looking identical.
 */

const FILES = "abcdefgh";

const PIECE_GLYPH: Record<string, Glyph> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

export interface OpeningDiagramProps {
  /** SAN moves from the start. Illegal input renders the start position. */
  moves: string[];
  /** Whose repertoire this is. Black's openings are shown from Black's side. */
  side?: "white" | "black";
  /** Rendered edge in px. Below ~56 the glyphs stop being readable. */
  px?: number;
  /**
   * Decorative by default. The name and the line are always beside it in text,
   * so a screen reader that announced the board too would read the same thing
   * twice. Pass a label only where the diagram stands alone.
   */
  title?: string;
}

interface Placed {
  file: number;
  rank: number;
  glyph: Glyph;
  white: boolean;
}

function OpeningDiagram({ moves, side = "white", px = 88, title }: OpeningDiagramProps) {
  const { placed, lastMove } = useMemo(() => {
    const board = new Chess();
    let last: { from: string; to: string } | null = null;
    for (const san of moves) {
      try {
        const move = board.move(san);
        if (!move) break;
        last = { from: move.from, to: move.to };
      } catch {
        // A line we cannot replay is a data problem, not a render problem. Show
        // what we got to rather than throwing inside a card.
        break;
      }
    }
    const out: Placed[] = [];
    for (const row of board.board()) {
      for (const square of row) {
        if (!square) continue;
        out.push({
          file: FILES.indexOf(square.square[0]),
          rank: Number(square.square[1]) - 1,
          glyph: PIECE_GLYPH[square.type],
          white: square.color === "w",
        });
      }
    }
    return { placed: out, lastMove: last };
  }, [moves]);

  const flip = side === "black";
  const cell = 100 / 8;
  // Board coordinates are file a-h left to right and rank 1 at the bottom;
  // SVG y grows downward, and flipping swaps both axes.
  const toXY = (file: number, rank: number) => ({
    x: (flip ? 7 - file : file) * cell,
    y: (flip ? rank : 7 - rank) * cell,
  });
  const squareXY = (square: string) =>
    toXY(FILES.indexOf(square[0]), Number(square[1]) - 1);

  return (
    <svg
      viewBox="0 0 100 100"
      width={px}
      height={px}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        display: "block",
        borderRadius: 10,
        overflow: "hidden",
        flexShrink: 0,
        boxShadow: "0 1px 0 rgba(255,255,255,0.06) inset",
      }}
    >
      {Array.from({ length: 64 }, (_, i) => {
        const col = i % 8;
        const row = Math.floor(i / 8);
        return (
          <rect
            key={i}
            x={col * cell}
            y={row * cell}
            width={cell}
            height={cell}
            fill={(col + row) % 2 === 0 ? LIGHT_SQ : DARK_SQ}
          />
        );
      })}

      {/* The move that made this position, so the eye lands on what changed.
          Ember as a glow on the square, never a fill over it. */}
      {lastMove &&
        [lastMove.from, lastMove.to].map((square) => {
          const { x, y } = squareXY(square);
          return (
            <rect
              key={square}
              x={x}
              y={y}
              width={cell}
              height={cell}
              fill="rgba(249,115,22,0.18)"
            />
          );
        })}

      {placed.map((p) => {
        const { x, y } = toXY(p.file, p.rank);
        return (
          <text
            key={`${p.file}-${p.rank}`}
            x={x + cell / 2}
            y={y + cell / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={cell * 0.82}
            fill={p.white ? WHITE_PIECE : BLACK_PIECE}
            style={{ pointerEvents: "none" }}
          >
            {GLYPH[p.glyph]}
          </text>
        );
      })}

      <rect
        x={0.4}
        y={0.4}
        width={99.2}
        height={99.2}
        fill="none"
        stroke={title ? EMBER : "rgba(255,255,255,0.10)"}
        strokeOpacity={title ? 0.35 : 1}
        strokeWidth={0.8}
        rx={2}
      />
    </svg>
  );
}

export default memo(OpeningDiagram);
