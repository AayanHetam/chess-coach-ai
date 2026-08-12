"use client";

import { memo } from "react";

/**
 * A tiny inline-SVG board crop used to SHOW a tactic instead of naming it.
 *
 * Why not the real board component: `ChessgroundBoard` pulls in chessground and
 * is built for an interactive 8×8. Seven of those on one onboarding step is a
 * lot of weight for a decorative 4×4 crop. This is pure SVG — no dependency, no
 * images, scales cleanly, and costs nothing to animate.
 *
 * Pieces are Unicode glyphs. Both colours use the FILLED glyph set: the hollow
 * "white" glyphs (♔♕♖) disappear against a dark board, so side is carried by
 * fill colour rather than by glyph, which is legible on any surface.
 */

import {
  GLYPH,
  LIGHT_SQ,
  DARK_SQ,
  WHITE_PIECE,
  BLACK_PIECE,
  EMBER,
  DANGER,
  QUIET,
  type Glyph,
} from "./diagramTokens";

export type { Glyph };
export type Side = "w" | "b";
export type Square = readonly [number, number]; // [col, row], 0-indexed from top-left

export interface DiagramPiece {
  at: Square;
  glyph: Glyph;
  side: Side;
}

export interface DiagramArrow {
  from: Square;
  to: Square;
  /** "attack" = the tactic itself (ember). "quiet" = supporting context. */
  tone?: "attack" | "quiet";
}

export interface DiagramMark {
  at: Square;
  /** "danger" = this piece is in trouble. "target" = the square that matters. */
  tone: "danger" | "target";
}

export interface DiagramSpec {
  /** Grid is `size` × `size`. Kept at 4 so pieces stay legible when small. */
  size: number;
  pieces: DiagramPiece[];
  arrows?: DiagramArrow[];
  marks?: DiagramMark[];
}

interface TacticDiagramProps {
  spec: DiagramSpec;
  /** Rendered edge length in px. Below ~64 the pieces stop being readable,
   *  which defeats the point of showing the tactic at all. */
  px?: number;
  /** Decorative by default; give it a label when it carries meaning alone. */
  title?: string;
}

function TacticDiagram({ spec, px = 72, title }: TacticDiagramProps) {
  const n = spec.size;
  const cell = 100 / n; // viewBox is a fixed 100×100, so px scaling is free
  const centre = (s: Square) => ({
    x: (s[0] + 0.5) * cell,
    y: (s[1] + 0.5) * cell,
  });

  return (
    <svg
      viewBox="0 0 100 100"
      width={px}
      height={px}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: "block", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}
    >
      <defs>
        {/* One marker per tone — SVG markers can't inherit stroke colour. */}
        <marker id="td-head-attack" markerWidth="4" markerHeight="4" refX="2.6" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" fill={EMBER} />
        </marker>
        <marker id="td-head-quiet" markerWidth="4" markerHeight="4" refX="2.6" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" fill={QUIET} />
        </marker>
      </defs>

      {/* Board */}
      {Array.from({ length: n * n }, (_, i) => {
        const col = i % n;
        const row = Math.floor(i / n);
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

      {/* Marks sit UNDER the pieces so a ring frames rather than obscures. */}
      {(spec.marks ?? []).map((m, i) => {
        const c = centre(m.at);
        const tone = m.tone === "danger" ? DANGER : EMBER;
        return (
          <circle
            key={`m${i}`}
            cx={c.x}
            cy={c.y}
            r={cell * 0.42}
            fill={m.tone === "danger" ? "rgba(248,113,113,0.16)" : "rgba(249,115,22,0.16)"}
            stroke={tone}
            strokeWidth={1.6}
            strokeDasharray={m.tone === "danger" ? "3 2.5" : undefined}
          />
        );
      })}

      {(spec.arrows ?? []).map((a, i) => {
        const from = centre(a.from);
        const to = centre(a.to);
        const attack = a.tone !== "quiet";
        // Stop short of the target square so the head points AT the piece
        // rather than landing on top of the glyph.
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const trim = cell * 0.34;
        return (
          <line
            key={`a${i}`}
            x1={from.x + (dx / len) * trim}
            y1={from.y + (dy / len) * trim}
            x2={to.x - (dx / len) * trim}
            y2={to.y - (dy / len) * trim}
            stroke={attack ? EMBER : QUIET}
            strokeWidth={2.4}
            strokeLinecap="round"
            markerEnd={`url(#td-head-${attack ? "attack" : "quiet"})`}
            opacity={attack ? 0.95 : 0.65}
          />
        );
      })}

      {spec.pieces.map((p, i) => {
        const c = centre(p.at);
        return (
          <text
            key={`p${i}`}
            x={c.x}
            y={c.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={cell * 0.9}
            fill={p.side === "w" ? WHITE_PIECE : BLACK_PIECE}
            style={{ userSelect: "none" }}
          >
            {GLYPH[p.glyph]}
          </text>
        );
      })}
    </svg>
  );
}

export default memo(TacticDiagram);
