import { Chess, Square } from "chess.js";

export interface ThreatEdge {
  defenseUci: string;
  defenseSan: string;
  consequence: ThreatNode | null;
}

export interface ThreatNode {
  threatUci: string;
  threatSan: string;
  capturedPiece: string | null;
  capturedSquare: Square | null;
  isCheck: boolean;
  isMate: boolean;
  approxMaterialGainCp: number;
  defenses: ThreatEdge[];
  depth: number;
  reasonStopped?: "depth-limit" | "no-threat-found" | "no-defense" | "mate";
}

const PIECE_VALUE_CP: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MAX_DEFENSES_PER_LEVEL = 3;
const MATERIAL_THREAT_THRESHOLD_CP = 200;

/**
 * Find threats: opponent moves from the current position that win material
 * (≥ MATERIAL_THREAT_THRESHOLD_CP) or check/checkmate. Limited to the top
 * MAX_DEFENSES_PER_LEVEL by material gain so the tree doesn't explode.
 */
function findOpponentThreats(fen: string): Array<{
  uci: string;
  san: string;
  captured: string | null;
  capturedSquare: Square | null;
  isCheck: boolean;
  isMate: boolean;
  materialGainCp: number;
}> {
  const game = new Chess(fen);
  const sideToMove = game.turn();

  const swapFen = swapSideToMove(fen);
  if (!swapFen) return [];
  const opponent = new Chess(swapFen);
  if (opponent.turn() === sideToMove) return [];

  const moves = opponent.moves({ verbose: true });
  const scored = moves.map((m) => {
    const capturedValue = m.captured ? (PIECE_VALUE_CP[m.captured] ?? 0) : 0;
    const result = opponent.move(m);
    const isCheck = opponent.inCheck();
    const isMate = opponent.isCheckmate();
    opponent.undo();
    return {
      uci: `${m.from}${m.to}${m.promotion ?? ""}`,
      san: result?.san ?? `${m.from}${m.to}`,
      captured: m.captured ?? null,
      capturedSquare: m.captured ? (m.to as Square) : null,
      isCheck,
      isMate,
      materialGainCp: capturedValue,
    };
  });

  return scored
    .filter((t) => t.isMate || t.isCheck || t.materialGainCp >= MATERIAL_THREAT_THRESHOLD_CP)
    .sort((a, b) => {
      if (a.isMate !== b.isMate) return a.isMate ? -1 : 1;
      if (a.isCheck !== b.isCheck) return a.isCheck ? -1 : 1;
      return b.materialGainCp - a.materialGainCp;
    })
    .slice(0, MAX_DEFENSES_PER_LEVEL);
}

function swapSideToMove(fen: string): string | null {
  const parts = fen.split(" ");
  if (parts.length < 2) return null;
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  return parts.join(" ");
}

function findDefenses(fen: string, threatUci: string): Array<{ uci: string; san: string }> {
  const game = new Chess(fen);
  const legalMoves = game.moves({ verbose: true });
  const ranked: Array<{ uci: string; san: string; score: number }> = [];

  for (const m of legalMoves) {
    const candidate = new Chess(fen);
    candidate.move(m);
    const opponentReplies = findOpponentThreats(candidate.fen());
    const stillThreatened = opponentReplies.some((t) => t.uci === threatUci || t.isMate);
    if (stillThreatened) continue;

    const worstReply = opponentReplies[0];
    const score = worstReply ? -worstReply.materialGainCp : 0;
    ranked.push({ uci: `${m.from}${m.to}${m.promotion ?? ""}`, san: m.san, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, MAX_DEFENSES_PER_LEVEL).map(({ uci, san }) => ({ uci, san }));
}

/**
 * Recursive threat-tree builder. For each top opponent threat, enumerate up to
 * MAX_DEFENSES_PER_LEVEL defenses, recurse on each defense to find the new
 * threats it permits. Stops at depthBudget plies.
 *
 * Output is the unit a coach explains: "if Black plays …Qxd4, you can defend
 * with Bxd4 — but then Bxd4 wins the bishop for a rook." See FUTURE_IDEAS.md
 * §1 Stage 3, threat-tree expansion (PR 1.A scope).
 */
export function buildThreatTree(fen: string, depthBudget: number): ThreatNode[] {
  if (depthBudget <= 0) return [];

  const threats = findOpponentThreats(fen);
  if (threats.length === 0) return [];

  return threats.map((t) => buildNode(fen, t, depthBudget, 0));
}

function buildNode(
  fenBefore: string,
  threat: ReturnType<typeof findOpponentThreats>[number],
  depthBudget: number,
  depth: number
): ThreatNode {
  const node: ThreatNode = {
    threatUci: threat.uci,
    threatSan: threat.san,
    capturedPiece: threat.captured,
    capturedSquare: threat.capturedSquare,
    isCheck: threat.isCheck,
    isMate: threat.isMate,
    approxMaterialGainCp: threat.materialGainCp,
    defenses: [],
    depth,
  };

  if (threat.isMate) {
    node.reasonStopped = "mate";
    return node;
  }
  if (depth + 1 >= depthBudget) {
    node.reasonStopped = "depth-limit";
    return node;
  }

  const defenses = findDefenses(fenBefore, threat.uci);
  if (defenses.length === 0) {
    node.reasonStopped = "no-defense";
    return node;
  }

  for (const d of defenses) {
    const trial = new Chess(fenBefore);
    try {
      trial.move({ from: d.uci.slice(0, 2), to: d.uci.slice(2, 4), promotion: d.uci[4] });
    } catch {
      continue;
    }
    const followUps = findOpponentThreats(trial.fen());
    const consequence: ThreatNode | null = followUps.length
      ? buildNode(trial.fen(), followUps[0], depthBudget, depth + 1)
      : null;
    node.defenses.push({ defenseUci: d.uci, defenseSan: d.san, consequence });
  }
  return node;
}
