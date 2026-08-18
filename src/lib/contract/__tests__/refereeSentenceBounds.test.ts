/**
 * REFEREE SENTENCE BOUNDS — the last fork of the naive `/(?<=[.!?])\s+/`
 * sentence rule, removed 2026-08-11.
 *
 * `src/lib/contract/sentences.ts` made citation coverage and the ladder's
 * sentence-drop chess-aware (a move number is not a sentence terminator), but
 * `refereeChecks.ts` kept its OWN `sentenceBounds` scan that ended a sentence
 * at ANY bare `.`. Every sentence-coupled licensing rule in the referee —
 * attack-map squares, claim-verb coupling, the definitional-sentence
 * exemption, per-sentence dedup, claim-piece resolution — therefore judged a
 * FRAGMENT and could not see a move or a piece named earlier in the true
 * sentence.
 *
 * The evidence is committed: the `sentence` field of
 * scripts/eval/results/contract-referee-fp-30game-v4-claude-sonnet-4-6.json's
 * flaggedSpans shipped adjudication context like "Kd8 18." and "Bxd2+ 7." —
 * a human adjudicator handed a move number instead of a claim. The first block
 * below reproduces those artifact strings EXACTLY from the retired scan, which
 * is what makes them evidence rather than anecdote.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

vi.hoisted(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
});

import { sentenceBoundsAt } from "@/lib/contract/sentences";
import { buildCoachContract } from "@/lib/contract/builder";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import {
  runInsightChecks,
  checkMobilityLiteralClaims,
} from "@/lib/contract/refereeChecks";
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import {
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
} from "@/lib/grounding/chessdb";

// ── The retired scan, verbatim, so the delta is demonstrated not asserted ────
function retiredSentenceBounds(prose: string, index: number): { start: number; end: number } {
  let start = 0;
  for (let i = index - 1; i >= 0; i--) {
    const ch = prose[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      start = i + 1;
      break;
    }
  }
  let end = prose.length;
  for (let i = index; i < prose.length; i++) {
    const ch = prose[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      end = i + 1;
      break;
    }
  }
  return { start, end };
}

/**
 * Multi-move coaching prose whose referee-visible sentence, under the retired
 * scan, collapses to the EXACT `sentence` string committed in the v4
 * measurement artifact (contract-referee-fp-30game-v4-claude-sonnet-4-6.json,
 * flaggedSpans, category hypothetical_line_off_contract).
 */
const V4_MIS_SPLITS: Array<{
  /** The span the referee anchors on (the artifact's quoted move run head). */
  span: string;
  /** Prose of the shape the model writes around that span. */
  prose: string;
  /** VERBATIM from the v4 artifact's flaggedSpans[].sentence. */
  v4Artifact: string;
  /** The move the fragment hid from every sentence-coupled rule. */
  hidden: string;
}> = [
  {
    span: "Kd8",
    prose: "If instead 17... Kd8 18. Nxe7 Kxe7, White has simply won a clean pawn.",
    v4Artifact: "Kd8 18.",
    hidden: "Nxe7",
  },
  {
    span: "Rdg8",
    prose: "Better was 20... Rdg8 21. Rde1 Kd8, keeping the rook active.",
    v4Artifact: "Rdg8 21.",
    hidden: "Rde1",
  },
  {
    span: "Bxd2",
    prose: "The engine line runs 6... Bxd2+ 7. Nbxd2 and Black is comfortable.",
    v4Artifact: "Bxd2+ 7.",
    hidden: "Nbxd2",
  },
  {
    span: "h3",
    prose: "White should meet it with 5. h3 Bxf3 6. Qxf3, keeping the pair.",
    v4Artifact: "h3 Bxf3 6.",
    hidden: "Qxf3",
  },
];

describe("v4 flaggedSpans prove the referee was reading fragments", () => {
  it.each(V4_MIS_SPLITS)(
    "the retired scan reproduces the committed artifact context $v4Artifact",
    ({ span, prose, v4Artifact }) => {
      const idx = prose.indexOf(span);
      const { start, end } = retiredSentenceBounds(prose, idx);
      expect(prose.slice(start, end).trim()).toBe(v4Artifact);
    },
  );

  it.each(V4_MIS_SPLITS)(
    "sentenceBoundsAt returns the whole sentence for $v4Artifact, so $hidden is visible again",
    ({ span, prose, hidden }) => {
      const idx = prose.indexOf(span);
      const { start, end } = sentenceBoundsAt(prose, idx);
      const sentence = prose.slice(start, end);
      expect(sentence.trim()).toBe(prose.trim());
      expect(sentence).toContain(hidden);
    },
  );

  it("eval decimals were the same bug — '+0.50 to +1.40' split at '0.'", () => {
    const prose = "The eval shifts from +0.50 to +1.40 after that trade.";
    const idx = prose.indexOf("+1.40");
    const old = retiredSentenceBounds(prose, idx);
    expect(prose.slice(old.start, old.end).trim()).toBe("50 to +1.");
    const now = sentenceBoundsAt(prose, idx);
    expect(prose.slice(now.start, now.end).trim()).toBe(prose.trim());
  });

  it("a genuine sentence end is still a sentence end", () => {
    const prose = "This is a forced mate in 4. The position is winning.";
    const idx = prose.indexOf("winning");
    const { start, end } = sentenceBoundsAt(prose, idx);
    expect(prose.slice(start, end).trim()).toBe("The position is winning.");
  });

  it("newlines still terminate (the insight grammar is line-oriented)", () => {
    const prose = "Idea: White pushed 8. e5 here.\n- Your knight on f6 is loose.";
    const idx = prose.indexOf("loose");
    const { start, end } = sentenceBoundsAt(prose, idx);
    expect(prose.slice(start, end).trim()).toBe("- Your knight on f6 is loose.");
  });
});

// ── Behavioural pin on the real fixtures-real contracts ─────────────────────
interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

const FIXTURES_DIR = path.join(__dirname, "fixtures-real");
const contracts = new Map<string, CoachContract>();

async function buildFixtureContract(name: string): Promise<CoachContract> {
  __clearChessdbCache();
  const f = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), "utf8"),
  ) as FixtureFile;
  const requestFen = getFenAtHalfMove(f.moveHistory, f.moveHistory.length);
  return buildCoachContract({
    moveHistory: f.moveHistory,
    gameEval: f.gameEval,
    playerColor: f.playerColor,
    username: f.username,
    userRating: f.userRating,
    gameHeaders: f.gameHeaders,
    uid: `bounds-${name}`,
    identity: { fen: requestFen, playerColor: f.playerColor || "w" },
  });
}

function insightOf(fixture: string, factIdPrefix: string): InsightContract {
  const contract = contracts.get(fixture);
  if (!contract) throw new Error(`contract missing for ${fixture}`);
  const insight = contract.insights.find((i) => i.factIdPrefix === factIdPrefix);
  if (!insight) throw new Error(`insight ${factIdPrefix} missing in ${fixture}`);
  return insight;
}

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in sentence-bounds referee tests");
  });
  for (const name of ["01_mate_for_white_midgame", "09_legal_trap_tactics"]) {
    contracts.set(name, await buildFixtureContract(name));
  }
}, 120_000);

afterAll(() => {
  __resetFetchForTesting();
});

describe("sentence-coupled checks see the whole sentence again", () => {
  // Fixture 01 / I2 is the adjudicated TRUE FABRICATION class: the knight on
  // e7 is called immobile when chess.js gives it 4 legal moves (round-2 spans
  // #0/#2/#4). The mobility check can only refute it after resolveClaimPiece
  // finds "knight on e7" — which lives before the move number here.
  const PROSE = "Black's knight on e7 is the problem: after 13. O-O it has no legal moves.";

  it("the retired scan hid the piece reference behind the move number", () => {
    const idx = PROSE.indexOf("no legal moves");
    const { start, end } = retiredSentenceBounds(PROSE, idx);
    const fragment = PROSE.slice(start, end);
    expect(fragment.trim()).toBe("O-O it has no legal moves.");
    expect(fragment).not.toContain("knight on e7");
  });

  it("the fragment alone refutes nothing — the fabrication escaped", () => {
    const insight = insightOf("01_mate_for_white_midgame", "M2");
    expect(checkMobilityLiteralClaims(" O-O it has no legal moves.", insight)).toEqual([]);
  });

  it("the whole sentence refutes it on chess.js arithmetic (4 legal moves)", () => {
    const insight = insightOf("01_mate_for_white_midgame", "M2");
    const fires = checkMobilityLiteralClaims(PROSE, insight);
    expect(fires).toHaveLength(1);
    expect(fires[0].category).toBe("mobility_count_wrong");
    expect(fires[0].span.toLowerCase()).toBe("no legal moves");
    expect(fires[0].detail).toContain("4 legal move(s)");
  });

  it("the v4 span it was measured from still fires unchanged (no move number, no delta)", () => {
    const insight = insightOf("01_mate_for_white_midgame", "M2");
    // VERBATIM v4 flaggedSpans[0].sentence.
    const v4 =
      "- Black's knight on e7: trapped with no legal moves — a complete waste of a piece right now.";
    expect(checkMobilityLiteralClaims(v4, insight).map((v) => v.span.toLowerCase())).toEqual([
      "no legal moves",
    ]);
  });
});

describe("the widened bounds do not launder a true fabrication", () => {
  // v2/v3/v4 TF: "g6 cuts off its retreat square on h5" is false — Bh5 is
  // legal and uncovered. square_unknown must keep firing, with or without a
  // move number in the sentence, or the follow-up-pack arming of
  // san_whitelist:square_unknown at error would be measuring nothing.
  const insight = () => insightOf("09_legal_trap_tactics", "M2");

  it("fires on the verbatim v3 span", () => {
    const spans = runInsightChecks(
      "- Your Bg4 is now stuck — g6 cuts off its retreat square on h5",
      insight(),
      contracts.get("09_legal_trap_tactics"),
    )
      .filter((v) => v.check === "san_whitelist")
      .map((v) => v.span.toLowerCase());
    expect(spans).toContain("h5");
  });

  it("still fires when a move number sits inside the sentence", () => {
    const spans = runInsightChecks(
      "The bishop is stuck: after 13. g6 it loses the retreat square on h5.",
      insight(),
      contracts.get("09_legal_trap_tactics"),
    )
      .filter((v) => v.check === "san_whitelist")
      .map((v) => v.span.toLowerCase());
    expect(spans).toContain("h5");
  });
});
