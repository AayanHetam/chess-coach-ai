import { PositionFeatureDelta } from "../featureDelta";
import { RoleChange } from "../pieceRoles";
import { ThreatNode } from "../threatTree";
import { cpToBand, evalToCp, QualitativeBand } from "./qualitativeBands";

export type CoachTone = "warm" | "blunt" | "playful";

export interface FallbackOpts {
  stockfishEval: { cp?: number; mate?: number };
  featureDelta?: PositionFeatureDelta;
  pieceRoleDiff?: RoleChange[];
  threatTree?: ThreatNode[];
  playerPerspective: "white" | "black";
  moveSan?: string;
  coachTone?: CoachTone;
}

interface BandPhrase {
  warm: string;
  blunt: string;
  playful: string;
}

const BAND_PHRASES_WHITE: Record<QualitativeBand, BandPhrase> = {
  winning: {
    warm: "White is winning here — the position is decisive.",
    blunt: "Winning for White.",
    playful: "White's got this — game's basically over.",
  },
  much_better: {
    warm: "White holds a significant advantage in this position.",
    blunt: "White is much better.",
    playful: "Big edge for White — comfortable seat.",
  },
  slightly_better: {
    warm: "White stands a touch better — a small but real edge.",
    blunt: "Slight edge to White.",
    playful: "White's a hair ahead — keep pushing.",
  },
  equal: {
    warm: "The position is balanced — neither side has a clear advantage.",
    blunt: "Equal.",
    playful: "Dead level — game on.",
  },
  slightly_worse: {
    warm: "White is a touch worse here — Black holds a small edge.",
    blunt: "Slight edge to Black.",
    playful: "Black's nudged ahead — don't panic.",
  },
  much_worse: {
    warm: "White faces a difficult position — Black holds a significant advantage.",
    blunt: "White is much worse.",
    playful: "Tough spot for White — Black's clearly ahead.",
  },
  losing: {
    warm: "White's position is in serious trouble — Black is winning.",
    blunt: "Losing for White.",
    playful: "Yikes — Black's basically there.",
  },
};

function bandPhrase(band: QualitativeBand, tone: CoachTone, perspective: "white" | "black"): string {
  if (perspective === "white") return BAND_PHRASES_WHITE[band][tone];
  const flipped: Record<QualitativeBand, QualitativeBand> = {
    losing: "winning",
    much_worse: "much_better",
    slightly_worse: "slightly_better",
    equal: "equal",
    slightly_better: "slightly_worse",
    much_better: "much_worse",
    winning: "losing",
  };
  return BAND_PHRASES_WHITE[flipped[band]][tone].replace(/White/g, "Black").replace(/Black/g, "White");
}

interface DeltaPhrase {
  text: string;
  importance: number;
}

function deltaPhrasesFromFeatureDelta(delta: PositionFeatureDelta): DeltaPhrase[] {
  const out: DeltaPhrase[] = [];

  for (const side of ["white", "black"] as const) {
    for (const sq of delta.pawnStructureDelta.passedPawnsGained[side]) {
      out.push({ text: `${cap(side)} gained a passed pawn on ${sq}.`, importance: 8 });
    }
    for (const sq of delta.pawnStructureDelta.passedPawnsLost[side]) {
      out.push({ text: `${cap(side)} lost the passed pawn on ${sq}.`, importance: 7 });
    }
  }

  for (const sq of delta.pawnStructureDelta.openFilesGained) {
    out.push({ text: `The ${sq[0]}-file opened up.`, importance: 5 });
  }
  for (const sq of delta.pawnStructureDelta.openFilesLost) {
    out.push({ text: `The ${sq[0]}-file closed.`, importance: 4 });
  }

  if (delta.materialDelta.white !== 0 || delta.materialDelta.black !== 0) {
    if (delta.materialDelta.white < 0) {
      const pts = Math.abs(delta.materialDelta.white);
      out.push({ text: `White lost material (${pts} point${pts === 1 ? "" : "s"}).`, importance: 9 });
    }
    if (delta.materialDelta.black < 0) {
      const pts = Math.abs(delta.materialDelta.black);
      out.push({ text: `Black lost material (${pts} point${pts === 1 ? "" : "s"}).`, importance: 9 });
    }
  }

  if (delta.kingSafetyDelta.white < -10) {
    out.push({ text: `White's king is less safe than before.`, importance: 7 });
  }
  if (delta.kingSafetyDelta.black < -10) {
    out.push({ text: `Black's king is less safe than before.`, importance: 7 });
  }

  for (const h of delta.hangingPiecesDelta.newlyHanging) {
    out.push({ text: `The ${h.color} ${h.piece} on ${h.square} is now hanging.`, importance: 8 });
  }

  return out.sort((a, b) => b.importance - a.importance);
}

function roleChangePhrases(diffs: RoleChange[]): string[] {
  const phrases: string[] = [];
  for (const change of diffs) {
    const color = change.color === "w" ? "White" : "Black";
    if (change.gained.length > 0) {
      phrases.push(`${color}'s ${pieceName(change.piece)} on ${change.square} became ${change.gained.join(", ")}.`);
    }
    if (change.lost.length > 0) {
      phrases.push(`${color}'s ${pieceName(change.piece)} on ${change.square} lost its role as ${change.lost.join(", ")}.`);
    }
  }
  return phrases;
}

function pieceName(p: string): string {
  return { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }[p] ?? p;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function threatSummary(tree: ThreatNode[]): string | null {
  if (!tree || tree.length === 0) return null;
  const top = tree[0];
  if (top.isMate) return `Watch out — your opponent has ${top.threatSan}, threatening mate.`;
  if (top.capturedPiece) {
    return `After this move, your opponent threatens ${top.threatSan}, winning the ${pieceName(top.capturedPiece)} on ${top.capturedSquare ?? "?"}.`;
  }
  return `Your opponent threatens ${top.threatSan}.`;
}

/**
 * Compose coaching prose from ground truth (Stockfish eval + Stage 3
 * feature delta + threat tree). Pure function, deterministic. No LLM call.
 * Used as the regenerate fallback path after retries exhaust — see
 * PR_1B_PLAN.md §8.
 *
 * Constraints:
 * - Never invents claims beyond what the inputs prove.
 * - No "may be inaccurate" disclaimer (response is built FROM ground truth).
 * - Section omitted when its corresponding input is empty.
 */
export function buildFallbackResponse(opts: FallbackOpts): string {
  const tone: CoachTone = opts.coachTone ?? "warm";
  const stockfishCp = evalToCp(opts.stockfishEval);
  const band = cpToBand(stockfishCp);
  const sections: string[] = [];

  sections.push(bandPhrase(band, tone, opts.playerPerspective));

  if (opts.featureDelta) {
    const phrases = deltaPhrasesFromFeatureDelta(opts.featureDelta).slice(0, 3);
    if (phrases.length > 0) {
      sections.push(`\nWhat changed:\n` + phrases.map((p) => `- ${p.text}`).join("\n"));
    }
  }

  const threat = opts.threatTree ? threatSummary(opts.threatTree) : null;
  if (threat) {
    sections.push(`\nTactical risk: ${threat}`);
  }

  if (opts.pieceRoleDiff && opts.pieceRoleDiff.length > 0) {
    const phrases = roleChangePhrases(opts.pieceRoleDiff).slice(0, 2);
    if (phrases.length > 0) {
      sections.push(`\nWhat to look at:\n` + phrases.map((p) => `- ${p}`).join("\n"));
    }
  }

  return sections.join("\n").trim();
}
