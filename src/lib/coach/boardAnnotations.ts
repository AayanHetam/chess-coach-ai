/**
 * Masti's marks on the board, computed by the app and never by the model.
 *
 * The strip under the board already says, in words, what a move does: the
 * check, the fork, the piece it leaves hanging. A reader looks at the board,
 * not at the words, so this module turns the same facts into marks drawn on
 * the position the move leaves: the move played and the engine's choice as
 * two arrows when they differ, what the move goes after ringed as a target,
 * what it leaves at risk ringed as a threat, and a mate it threatens or
 * allows as an arrow.
 *
 * The facts are the move's own story facts (lineStory.ts, passed through by
 * captionLine), so one story call serves the caption, the ledger and the
 * marks. They are heuristic readings, so a square is drawn only when chess.js
 * on the position shown backs it: the piece is there and the attack is real
 * (`factsConfirmAttack` over `buildRelationalFacts`). Kings are never ringed
 * (the check glow marks a checked king), and the marks are capped so a busy
 * position stays readable. Nothing is drawn about the engine's move, whose
 * facts describe a position that is not on the board.
 *
 * Pure and client-safe. Never throws: anything that fails to replay draws
 * nothing.
 */
import { Chess, type Color, type Move, type Square } from "chess.js";
import type { StoryFact } from "@/lib/contract/lineStory";
import {
  buildRelationalFacts,
  factsConfirmAttack,
  type RelationalFactsBlock,
} from "@/lib/relational/relationalFactsBuilder";

export type AnnotationTag = "played" | "engine" | "threat" | "target";
export type AnnotationSource = "strip" | "line";

export interface AnnotationArrow {
  orig: Square;
  dest: Square;
  tag: AnnotationTag;
}

export interface AnnotationSquare {
  square: Square;
  tag: "threat" | "target";
}

export interface BoardAnnotation {
  /** The position it is drawn on, and never on any other. */
  fen: string;
  source: AnnotationSource;
  arrows: AnnotationArrow[];
  squares: AnnotationSquare[];
}

export interface AnnotationInput {
  source: AnnotationSource;
  /** The position the move was played from. */
  fenBefore: string;
  /** SAN, replayed on fenBefore. */
  played: string;
  /** SAN of the engine's choice at fenBefore. */
  engine?: string | null;
  /** The played move's story facts (on the position after it). */
  facts?: readonly StoryFact[];
  /**
   * The strip: true. A line's ply: false, because the preview arrow and the
   * last-move squares already show the move.
   */
  moveArrows: boolean;
}

export const ANNOTATION_STYLE: Record<
  AnnotationTag,
  { brush: string; color: string }
> = {
  // ProofLine's played accent, the last-move orange.
  played: { brush: "cmPlayed", color: "#FB923C" },
  // ProofLine's engine accent, the strip's "Engine preferred".
  engine: { brush: "cmEngine", color: "#86EFAC" },
  threat: { brush: "cmThreat", color: "#F87171" },
  target: { brush: "cmTarget", color: "#38BDF8" },
};

export const ANNOTATION_SQUARE_CLASS = {
  threat: "cm-anno-threat",
  target: "cm-anno-target",
} as const;

export const MAX_ANNOTATION_SQUARES = 4;
export const MAX_FACT_ARROWS = 2;

type Motif = Extract<StoryFact, { kind: "motif" }>["motif"];

/** The first four FEN fields: the position, whatever its move counters say. */
export function samePosition(a: string, b: string): boolean {
  const key = (fen: string) => fen.trim().split(/\s+/).slice(0, 4).join(" ");
  const ka = key(a);
  return ka !== "" && ka === key(b);
}

const other = (c: Color): Color => (c === "w" ? "b" : "w");

/** `san` played on `fen`, or null when it does not replay. */
function playMove(
  fen: string,
  san: string
): { move: Move; game: Chess } | null {
  try {
    const game = new Chess(fen);
    const move = game.move(san);
    return move ? { move, game } : null;
  } catch {
    return null;
  }
}

/** Compared by squares and promotion, never by SAN text: Nc7 and Nc7+ are one move. */
function sameMove(a: Move, b: Move): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    (a.promotion ?? "") === (b.promotion ?? "")
  );
}

/** The position with `color` to move (en passant cleared), as lineStory reads a threat. */
function withTurn(fen: string, color: Color): string {
  const parts = fen.split(" ");
  if (parts[1] !== color) {
    parts[1] = color;
    parts[3] = "-";
  }
  return parts.join(" ");
}

/** A mate the fact names, as an arrow, only when it replays as mate on `fen`. */
function mateArrow(
  fen: string,
  mateSan: string
): { orig: Square; dest: Square } | null {
  const replayed = playMove(fen, mateSan);
  if (!replayed || !replayed.game.isCheckmate()) return null;
  return { orig: replayed.move.from, dest: replayed.move.to };
}

export function buildBoardAnnotation(
  input: AnnotationInput
): BoardAnnotation | null {
  try {
    return build(input);
  } catch {
    return null;
  }
}

function build(input: AnnotationInput): BoardAnnotation | null {
  const played = playMove(input.fenBefore, input.played);
  if (!played) return null;
  const fen = played.game.fen();
  const mover = played.move.color;
  const enemy = other(mover);

  // 1. The move played and the engine's choice, only when they differ.
  const moveArrows: AnnotationArrow[] = [];
  if (input.moveArrows && input.engine) {
    const engine = playMove(input.fenBefore, input.engine);
    if (engine && !sameMove(engine.move, played.move)) {
      moveArrows.push(
        { orig: played.move.from, dest: played.move.to, tag: "played" },
        { orig: engine.move.from, dest: engine.move.to, tag: "engine" }
      );
    }
  }

  // 2. The facts, each kept only when the board backs it.
  const threats: Square[] = [];
  const targets: Square[] = [];
  const factArrows: AnnotationArrow[] = [];
  const facts = input.facts ?? [];
  if (facts.length > 0) {
    const after = new Chess(fen);
    const rel: RelationalFactsBlock = buildRelationalFacts(fen);
    const holds = (sq: Square, color: Color, piece?: string): boolean => {
      const p = after.get(sq);
      return (
        !!p && p.color === color && (piece === undefined || p.type === piece)
      );
    };
    const attacks = (by: Color, from: Square | undefined, sq: Square) =>
      factsConfirmAttack(rel, by, from, sq);
    const isKing = (sq: Square) => after.get(sq)?.type === "k";
    const target = (sq: Square) => {
      if (!isKing(sq)) targets.push(sq);
    };
    const threat = (sq: Square) => {
      if (!isKing(sq)) threats.push(sq);
    };
    const arrow = (
      a: { orig: Square; dest: Square } | null,
      tag: "threat" | "target"
    ) => {
      if (a) factArrows.push({ orig: a.orig, dest: a.dest, tag });
    };

    const motif = (m: Motif) => {
      switch (m.motif) {
        case "fork":
          for (const t of m.targets) {
            if (t.piece === "k") continue;
            if (
              holds(t.square, enemy, t.piece) &&
              attacks(mover, m.by_square, t.square)
            )
              target(t.square);
          }
          return;
        case "pin":
          if (
            holds(m.pinned.square, enemy, m.pinned.piece) &&
            attacks(mover, m.pinner.square, m.pinned.square)
          )
            target(m.pinned.square);
          return;
        case "skewer":
          if (!attacks(mover, m.skewerer.square, m.front.square)) return;
          if (m.front.piece !== "k") target(m.front.square);
          if (holds(m.back.square, enemy, m.back.piece)) target(m.back.square);
          return;
        case "discovered_attack":
          if (m.victim.piece === "k") return;
          if (
            holds(m.victim.square, enemy, m.victim.piece) &&
            attacks(mover, m.revealer.square, m.victim.square)
          ) {
            target(m.victim.square);
            arrow({ orig: m.revealer.square, dest: m.victim.square }, "target");
          }
          return;
        case "removed_defender":
          if (
            holds(m.was_defending.square, enemy, m.was_defending.piece) &&
            attacks(mover, undefined, m.was_defending.square)
          )
            target(m.was_defending.square);
          return;
        case "trapped_piece":
          if (holds(m.square, enemy, m.piece)) target(m.square);
          return;
        default:
          return;
      }
    };

    for (const f of facts) {
      switch (f.kind) {
        case "motif":
          motif(f.motif);
          break;
        case "attacks":
        case "attacks_pinned":
          if (
            holds(f.square, enemy, f.piece) &&
            attacks(mover, undefined, f.square)
          )
            target(f.square);
          break;
        case "threatens_mate":
          // The mover's next move, so it is read with the mover to move.
          arrow(mateArrow(withTurn(fen, mover), f.mateSan), "target");
          break;
        case "allows_mate":
          // The opponent is to move on the position shown.
          arrow(mateArrow(fen, f.mateSan), "threat");
          break;
        case "en_prise":
        case "still_en_prise":
          if (
            holds(f.square, mover, f.piece) &&
            attacks(enemy, undefined, f.square)
          )
            threat(f.square);
          break;
        case "leaves_trapped":
          if (holds(f.square, mover, f.piece)) threat(f.square);
          break;
        default:
          // Checks, mates, captures, promotions, castling, the only-move and
          // check-escape kinds and the quiet purposes: the strip's sentence
          // already says them.
          break;
      }
    }
  }

  // 3. Threats first, then targets in fact order, one ring per square.
  const squares: AnnotationSquare[] = [];
  const ringed = new Set<Square>();
  for (const [list, tag] of [
    [threats, "threat"],
    [targets, "target"],
  ] as const) {
    for (const sq of list) {
      if (ringed.has(sq) || squares.length >= MAX_ANNOTATION_SQUARES) continue;
      ringed.add(sq);
      squares.push({ square: sq, tag });
    }
  }

  const drawn = new Set(moveArrows.map((a) => `${a.orig}${a.dest}`));
  const arrows: AnnotationArrow[] = [...moveArrows];
  let factCount = 0;
  for (const a of factArrows) {
    const key = `${a.orig}${a.dest}`;
    if (drawn.has(key) || factCount >= MAX_FACT_ARROWS) continue;
    drawn.add(key);
    arrows.push(a);
    factCount += 1;
  }

  if (arrows.length === 0 && squares.length === 0) return null;
  return { fen, source: input.source, arrows, squares };
}
