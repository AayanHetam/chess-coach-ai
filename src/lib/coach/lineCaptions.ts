/**
 * What each move of a line DOES, for the proof line the coach panel draws.
 *
 * The server already computes this for the model (lineStory.ts: checks,
 * captures, the fork or pin a move creates, what it leaves hanging, a running
 * material ledger). The client has the same engine lines (every ply's PV
 * comes back from the browser's Stockfish) and the same chess.js, so it can
 * compute the same captions for any line it shows — an engine line under a
 * card, a line the coach cites in a follow-up, the game's own continuation —
 * with no model in the loop and nothing to hallucinate.
 *
 * Pure. Never throws: a line that fails to replay captions as far as it got.
 */
import {
  buildLineStory,
  type LineStory,
  type PlyStory,
} from "@/lib/contract/lineStory";

export interface LineCaption {
  san: string;
  /** "8." / "8..." — the number the chip shows before a White move, or a Black move that opens the line. */
  label: string;
  /** What the move does, or "" for a quiet move. Short: the first two facts. */
  caption: string;
  /** Every fact, for a tooltip. */
  full: string;
  mover: "w" | "b";
}

export interface LineCaptions {
  plies: LineCaption[];
  /** "you come out a queen up", "White ends 3 up", "material stays level". */
  ledger: string;
  endsInMate: boolean;
  /** The first move offers material the shown moves never win back. */
  sacrifice: boolean;
}

const PIECE_WORD: Record<string, string> = {
  "9": "a queen",
  "5": "a rook",
  "3": "a piece",
};

function ledgerText(story: LineStory, playerColor: "w" | "b" | null): string {
  const net = story.netMaterialCp;
  const owner = story.owner;
  const ownerIsPlayer = playerColor !== null && owner === playerColor;
  const ownerName = ownerIsPlayer ? "you" : owner === "w" ? "White" : "Black";
  if (story.endsInMate) {
    // The mover of the last ply delivered it.
    const last = story.plies[story.plies.length - 1];
    const winner = last ? last.mover : owner;
    const winnerIsPlayer = playerColor !== null && winner === playerColor;
    return winnerIsPlayer
      ? "you deliver mate"
      : `${winner === "w" ? "White" : "Black"} mates`;
  }
  if (story.endsInStalemate) return "stalemate, a draw";
  if (net === 0) return "material stays level";
  const units = Math.abs(net) / 100;
  const amount =
    PIECE_WORD[String(units)] ??
    `${units % 1 === 0 ? units : units.toFixed(1)}`;
  const verb = ownerIsPlayer ? "come out" : "ends";
  const named = amount in PIECE_WORD || /^a /.test(amount);
  if (net > 0)
    return `${ownerName} ${verb} ${amount} ${named ? "up" : "up"}`.replace(
      "  ",
      " "
    );
  return `${ownerName} ${verb} ${amount} down`;
}

/** The part of a ply's sayable after its "8.Nc7+ — " prefix, clipped to two facts. */
function plyCaption(p: PlyStory): { short: string; full: string } {
  const dash = p.sayable.indexOf(" — ");
  const full = dash >= 0 ? p.sayable.slice(dash + 3) : "";
  const facts = full ? full.split("; ") : [];
  return { short: facts.slice(0, 2).join("; "), full };
}

/**
 * Captions for `sans` played from `startFen`. `playerColor` phrases the
 * ledger in the second person when the line is the player's.
 */
export function captionLine(
  startFen: string,
  sans: readonly string[],
  playerColor: "w" | "b" | null = null,
  maxPlies = 8
): LineCaptions {
  let story: LineStory;
  try {
    story = buildLineStory(startFen, sans, { maxPlies });
  } catch {
    return { plies: [], ledger: "", endsInMate: false, sacrifice: false };
  }
  const plies: LineCaption[] = story.plies.map((p) => {
    const { short, full } = plyCaption(p);
    return { san: p.san, label: p.label, caption: short, full, mover: p.mover };
  });
  return {
    plies,
    ledger: ledgerText(story, playerColor),
    endsInMate: story.endsInMate,
    sacrifice: story.unresolvedSacrifice !== null,
  };
}
