/**
 * The lines the coach panel can draw, resolved from what the client already
 * holds: the browser's own Stockfish evaluation of every position and the
 * game's move list. Pure, so the two readers of a line token — the insight
 * card and the follow-up bubble — resolve it the same way.
 *
 * Move-number arithmetic, once: White's move N sits at half-move index
 * 2(N-1), Black's at 2N-1. A token names the move the line is INSTEAD of
 * ([CONTINUATION]) or STARTS WITH ([PLAYED]), so the position it is played
 * from is the one before that move.
 */
import { Chess } from "chess.js";
import type { PositionEval } from "@/types/eval";

export interface CoachLine {
  kind: "engine" | "played";
  /** Mainline half-move count of the position the line starts from. */
  anchorPly: number;
  startFen: string;
  sans: string[];
  moveNumber: number;
  startsWhite: boolean;
  /** "+6.20" / "M+3" for an engine line; the eval AFTER the last shown ply for the game's line is not shown. */
  evalDisplay: string | null;
  depth: number | null;
}

export function halfMoveIndex(moveNumber: number, color: "w" | "b"): number {
  return color === "b" ? moveNumber * 2 - 1 : (moveNumber - 1) * 2;
}

function replayTo(
  rootFen: string | undefined,
  sans: readonly string[],
  plies: number
): string | null {
  try {
    const g = rootFen ? new Chess(rootFen) : new Chess();
    for (let i = 0; i < plies; i++) g.move(sans[i]);
    return g.fen();
  } catch {
    return null;
  }
}

function formatEval(line: { cp?: number; mate?: number }): string | null {
  if (typeof line.mate === "number")
    return `M${line.mate > 0 ? "+" : ""}${line.mate}`;
  if (typeof line.cp === "number")
    return `${line.cp >= 0 ? "+" : ""}${(line.cp / 100).toFixed(2)}`;
  return null;
}

/**
 * The engine's best line from the position before move `moveNumber` by
 * `color`, or null when there is no engine data for it.
 */
export function engineLineAt(
  enginePositions: readonly PositionEval[] | null | undefined,
  gameSans: readonly string[],
  moveNumber: number,
  color: "w" | "b",
  rootFen?: string,
  maxPlies = 8
): CoachLine | null {
  const idx = halfMoveIndex(moveNumber, color);
  if (!enginePositions || idx < 0 || idx > gameSans.length) return null;
  const line = enginePositions[idx]?.lines?.[0];
  if (!line?.pv || line.pv.length === 0 || line.depth === 0) return null;
  const startFen = replayTo(rootFen, gameSans, idx);
  if (!startFen) return null;
  const sans: string[] = [];
  try {
    const g = new Chess(startFen);
    for (const uci of line.pv.slice(0, maxPlies)) {
      const mv = g.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length >= 5 ? uci[4] : undefined,
      });
      if (!mv) break;
      sans.push(mv.san);
    }
  } catch {
    /* keep what replayed */
  }
  if (sans.length === 0) return null;
  return {
    kind: "engine",
    anchorPly: idx,
    startFen,
    sans,
    moveNumber,
    startsWhite: color === "w",
    evalDisplay: formatEval(line),
    depth: typeof line.depth === "number" ? line.depth : null,
  };
}

/**
 * What the game did from move `moveNumber` by `color`: that move and the
 * plies that followed it.
 */
export function playedLineAt(
  gameSans: readonly string[],
  moveNumber: number,
  color: "w" | "b",
  rootFen?: string,
  maxPlies = 6,
  /** With engine data, the chip carries the eval after the last shown ply. */
  enginePositions?: readonly PositionEval[] | null
): CoachLine | null {
  const idx = halfMoveIndex(moveNumber, color);
  if (idx < 0 || idx >= gameSans.length) return null;
  const startFen = replayTo(rootFen, gameSans, idx);
  if (!startFen) return null;
  const sans = gameSans.slice(idx, idx + maxPlies);
  const after = enginePositions?.[idx + sans.length]?.lines?.[0];
  return {
    kind: "played",
    anchorPly: idx,
    startFen,
    sans,
    moveNumber,
    startsWhite: color === "w",
    evalDisplay: after && after.depth !== 0 ? formatEval(after) : null,
    depth: null,
  };
}

/** A line token on a line of its own: `[CONTINUATION:8:w]`, `[PLAYED:8:w]`, `[MAIA_CONTINUATION:8:w]`. */
export const LINE_TOKEN_LINE_RE =
  /^\s*\[(CONTINUATION|PLAYED|MAIA_CONTINUATION):(\d+):([wb])\]\s*$/i;
/** The same tokens anywhere in prose, for stripping. */
export const LINE_TOKEN_INLINE_RE =
  /\[(?:CONTINUATION|PLAYED|MAIA_CONTINUATION):\d+:[wb]\]/gi;

export interface LineToken {
  kind: "engine" | "played" | "maia";
  moveNumber: number;
  color: "w" | "b";
}

export function parseLineToken(line: string): LineToken | null {
  const m = LINE_TOKEN_LINE_RE.exec(line);
  if (!m) return null;
  const tag = m[1].toUpperCase();
  return {
    kind:
      tag === "PLAYED"
        ? "played"
        : tag === "MAIA_CONTINUATION"
          ? "maia"
          : "engine",
    moveNumber: parseInt(m[2], 10),
    color: m[3].toLowerCase() as "w" | "b",
  };
}

/**
 * Split prose into text chunks and line tokens, in order. A token counts
 * only on a line of its own; tokens inside a sentence are stripped, so the
 * literal `[CONTINUATION:8:w]` never reaches the reader.
 */
export function splitProseByLineTokens(
  text: string
): Array<{ kind: "text"; text: string } | { kind: "token"; token: LineToken }> {
  const out: Array<
    { kind: "text"; text: string } | { kind: "token"; token: LineToken }
  > = [];
  let buf: string[] = [];
  const flush = () => {
    const joined = buf.join("\n").trim();
    if (joined) out.push({ kind: "text", text: joined });
    buf = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const token = parseLineToken(raw);
    if (token) {
      flush();
      out.push({ kind: "token", token });
      continue;
    }
    buf.push(raw.replace(LINE_TOKEN_INLINE_RE, "").replace(/[ \t]{2,}/g, " "));
  }
  flush();
  return out;
}
