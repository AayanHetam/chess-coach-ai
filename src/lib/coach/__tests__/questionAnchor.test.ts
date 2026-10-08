import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { anchorAtIndex, resolveQuestionAnchor } from "../questionAnchor";

// Fixture 07 (the knight-fork game): White's 8. Nc7+ forks king and rook
// while Black's queen on c1 was free for the taking with 8. Qxc1.
const MOVES = [
  "e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Qb6",
  "Nf3", "Qxb2", "Na3", "Qxa1", "Nb5", "Qxc1", "Nc7+", "Kd8",
  "Nxa8", "Qxd1+", "Kxd1", "e5",
];

function fenAfter(n: number): string {
  const g = new Chess();
  for (let i = 0; i < n; i++) g.move(MOVES[i]);
  return g.fen();
}

describe("resolveQuestionAnchor — numbered notation", () => {
  it("resolves White's numbered move to the ply after it, with both boards", () => {
    const a = resolveQuestionAnchor("Why was 8. Nc7+ a mistake?", MOVES, "w");
    expect(a).not.toBeNull();
    expect(a!.index).toBe(14);
    expect(a!.moveNumber).toBe(8);
    expect(a!.color).toBe("w");
    expect(a!.san).toBe("Nc7+");
    expect(a!.ply).toBe(15);
    expect(a!.fenBefore).toBe(fenAfter(14));
    expect(a!.fenAfter).toBe(fenAfter(15));
    expect(a!.matched).toBe("numbered");
    expect(a!.askedSan).toBeUndefined();
  });

  it("resolves Black's three-dot notation, with or without a space", () => {
    expect(resolveQuestionAnchor("what about 8... Kd8?", MOVES)?.index).toBe(15);
    expect(resolveQuestionAnchor("8...Kd8 looked forced", MOVES)?.index).toBe(15);
  });

  it("an alternative written in notation anchors to that spot and is reported as asked", () => {
    const a = resolveQuestionAnchor("why not 8. Qxc1?", MOVES);
    expect(a?.index).toBe(14);
    expect(a?.san).toBe("Nc7+");
    expect(a?.askedSan).toBe("Qxc1");
  });

  it("prefers the reference that was actually played over an alternative in the same question", () => {
    const a = resolveQuestionAnchor("Why 8. Nc7+ instead of 8. Qxc1?", MOVES);
    expect(a?.index).toBe(14);
    expect(a?.askedSan).toBeUndefined();
  });

  it("ignores a move number the game never reached", () => {
    expect(resolveQuestionAnchor("what about 40. Qh7#?", MOVES)).toBeNull();
  });
});

describe("resolveQuestionAnchor — 'move N' with no notation", () => {
  it("is the player's own move by default", () => {
    expect(resolveQuestionAnchor("what happened on move 8?", MOVES, "w")?.index).toBe(14);
    expect(resolveQuestionAnchor("what happened on move 8?", MOVES, "b")?.index).toBe(15);
  });

  it("accepts ordinals", () => {
    expect(resolveQuestionAnchor("my 8th move felt wrong", MOVES, "w")?.index).toBe(14);
  });

  it("falls back to the other side when the player's move at that number does not exist", () => {
    // Move 10 for Black (index 19, e5) exists; White's 11th does not.
    expect(resolveQuestionAnchor("move 10", MOVES, "b")?.index).toBe(19);
    expect(resolveQuestionAnchor("move 11", MOVES, "w")).toBeNull();
  });
});

describe("resolveQuestionAnchor — bare notation", () => {
  it("finds a piece move written without a number", () => {
    const a = resolveQuestionAnchor("Nc7+ looked strong, why not?", MOVES);
    expect(a?.index).toBe(14);
    expect(a?.matched).toBe("bare-san");
  });

  it("picks the occurrence nearest the viewed board when a move was played twice", () => {
    const moves = ["e4", "e5", "Nf3", "Nc6", "Ng1", "Nb8", "Nf3", "Nc6"];
    expect(resolveQuestionAnchor("was Nf3 good?", moves, "w", 1)?.index).toBe(2);
    expect(resolveQuestionAnchor("was Nf3 good?", moves, "w", 8)?.index).toBe(6);
    expect(resolveQuestionAnchor("was Nf3 good?", moves, "w")?.index).toBe(2);
  });

  it("does not read a square as a pawn move without a cue", () => {
    expect(resolveQuestionAnchor("is my king safe on e1?", MOVES)).toBeNull();
    expect(resolveQuestionAnchor("should I have played e5 earlier?", MOVES)?.san).toBe("e5");
  });
});

describe("resolveQuestionAnchor — nothing to anchor", () => {
  it("returns null for a general question", () => {
    expect(resolveQuestionAnchor("what should I study next?", MOVES)).toBeNull();
    expect(resolveQuestionAnchor("thanks!", MOVES)).toBeNull();
    expect(resolveQuestionAnchor("Why was 8. Nc7+ bad?", [])).toBeNull();
  });
});

describe("anchorAtIndex: the anchor a verified what-if names", () => {
  // 1.b3 Nc6 2.e3 Ne5 3.Nc3 Nc4 4.bxc4: the pawn took on c4, and the
  // bishop could have.
  const GAME = "b3 Nc6 e3 Ne5 Nc3 Nc4 bxc4".split(" ");

  it("compares the server's own SANs as written: Bxc4 is not bxc4", () => {
    const a = anchorAtIndex(GAME, 6, "Bxc4")!;
    expect(a.matched).toBe("what-if");
    expect(a.san).toBe("bxc4");
    expect(a.askedSan).toBe("Bxc4");
  });

  it("the game's own move is no alternative, its check sign or not; past the last move there is no anchor", () => {
    expect(anchorAtIndex(GAME, 6, "bxc4")!.askedSan).toBeUndefined();
    expect(anchorAtIndex(GAME, 6)!.askedSan).toBeUndefined();
    expect(anchorAtIndex(GAME, 7, "Qg4")).toBeNull();
  });
});

describe("resolveQuestionAnchor — the follow-up's side reading (opts)", () => {
  // As the route passes them on a turn with a subject from the words or the page.
  const as = (defaultSide: "w" | "b", more: Record<string, unknown> = {}) => ({
    defaultSide,
    sideConfirmed: true,
    preferDefaultSide: true,
    ...more,
  });
  // As the route passes them with the flag on and no subject.
  const plain = (playerSide: "w" | "b") => ({
    defaultSide: playerSide,
    sideConfirmed: true,
  });

  it("without opts, a named side beside the number is not read (as before)", () => {
    expect(resolveQuestionAnchor("why was Black's move 8 bad?", MOVES, "w")?.index).toBe(14);
    expect(resolveQuestionAnchor("why was move 8 bad?", MOVES, "w")?.index).toBe(14);
    expect(resolveQuestionAnchor("after Black's move 7, what then?", MOVES, "w")?.index).toBe(12);
  });

  it("a bare move N is the default side's move N", () => {
    expect(resolveQuestionAnchor("why was move 8 bad?", MOVES, "w", undefined, as("b"))?.index).toBe(15);
    expect(resolveQuestionAnchor("the 8th move?", MOVES, "w", undefined, as("b"))?.index).toBe(15);
    expect(resolveQuestionAnchor("why was move 8 bad?", MOVES, "w", undefined, as("w"))?.index).toBe(14);
  });

  it("an owner beats the default: my is the player's, my opponent's the other side's", () => {
    expect(resolveQuestionAnchor("from Black's side, why was my 8th move bad?", MOVES, "w", undefined, as("b"))?.index).toBe(14);
    expect(resolveQuestionAnchor("and my move 8?", MOVES, "w", undefined, as("b"))?.index).toBe(14);
    expect(resolveQuestionAnchor("what was my opponent thinking on my opponent's 8th move", MOVES, "w", undefined, as("w"))?.index).toBe(15);
    expect(resolveQuestionAnchor("opponent’s move 8", MOVES, "w", undefined, as("w"))?.index).toBe(15);
    expect(resolveQuestionAnchor("their 8th move", MOVES, "b", undefined, as("b"))?.index).toBe(14);
  });

  it("relative owners need a confirmed side; colours do not", () => {
    const unconfirmed = { defaultSide: "w" as const, sideConfirmed: false };
    // "my opponent's" cannot be read, and the guessed player's move is the
    // one it excludes: no move is named.
    expect(resolveQuestionAnchor("my opponent's 8th move", MOVES, "w", undefined, unconfirmed)).toBeNull();
    expect(resolveQuestionAnchor("why was move 7 by my opponent bad?", MOVES, "w", undefined, unconfirmed)).toBeNull();
    expect(resolveQuestionAnchor("Black's 8th move", MOVES, "w", undefined, unconfirmed)?.index).toBe(15);
  });

  it("a colour beside the number is that colour's move", () => {
    expect(resolveQuestionAnchor("why was Black's move 8 bad?", MOVES, "w", undefined, as("w"))?.index).toBe(15);
    expect(resolveQuestionAnchor("explain black's 8th move", MOVES, "w", undefined, as("w"))?.index).toBe(15);
    expect(resolveQuestionAnchor("explain move 8 for Black", MOVES, "w", undefined, as("w"))?.index).toBe(15);
    expect(resolveQuestionAnchor("explain White's 8th move", MOVES, "b", undefined, as("b"))?.index).toBe(14);
  });

  it("after an owner's move, a question asking for a move is about the reply", () => {
    // After Black's 7... Qxc1 the player's reply is 8. Nc7+.
    expect(resolveQuestionAnchor("after Black's move 7, what should I have played?", MOVES, "w", undefined, plain("w"))?.index).toBe(14);
    expect(resolveQuestionAnchor("in reply to my opponent's 7th move, was Nc7+ right?", MOVES, "w", undefined, plain("w"))?.index).toBe(14);
    expect(resolveQuestionAnchor("after black's move 7, what was the best reply?", MOVES, "w", undefined, plain("w"))?.index).toBe(14);
  });

  it("after an owner's move, a question about the position is about that move", () => {
    for (const q of [
      "what was the eval after Black's move 7?",
      "after black's 7th move, who was better?",
      "how did the position look after my opponent's 7th move?",
    ])
      expect(resolveQuestionAnchor(q, MOVES, "w", undefined, plain("w"))?.index, q).toBe(13);
    // "for Black" beside a position word is in Black's favour, not an owner.
    expect(resolveQuestionAnchor("what's the eval after move 7 for Black?", MOVES, "w", undefined, plain("w"))?.index).toBe(12);
  });

  it("a side as the verb's subject owns the move number", () => {
    for (const q of [
      "what did black play on move 7?",
      "what did my opponent play on move 7?",
      "how did black respond on move 7?",
      "on move 7 black played Qxc1, why?",
      "why was move 7 by my opponent bad?",
      "why was my opponents 7th move bad?",
    ])
      expect(resolveQuestionAnchor(q, MOVES, "w", undefined, plain("w"))?.index, q).toBe(13);
    // Two sides as subjects: no owner, as before.
    expect(resolveQuestionAnchor("white played and black played, what about move 7?", MOVES, "w", undefined, plain("w"))?.index).toBe(12);
  });

  it("with no owner and no subject, the reading is the one without opts", () => {
    const short = MOVES.slice(0, 19);
    for (const q of ["why was move 10 bad?", "why did I move 3 pawns so early?", "move 60?"]) {
      const missing: unknown[] = [];
      expect(
        resolveQuestionAnchor(q, short, "w", undefined, { ...plain("w"), onMissing: (m) => missing.push(m) })?.index,
        q
      ).toBe(resolveQuestionAnchor(q, short, "w")?.index);
      expect(missing, q).toEqual([]);
    }
  });

  it("a count of things moved is not a move number", () => {
    expect(resolveQuestionAnchor("why did Black move 3 pawns on the queenside?", MOVES, "w", undefined, as("w"))).toBeNull();
  });

  it("a named owner, or a strict default, with no such move does not fall back, and says so", () => {
    const short = MOVES.slice(0, 19); // White's 10th is the last move
    const missing: unknown[] = [];
    const onMissing = (m: unknown) => missing.push(m);
    expect(resolveQuestionAnchor("Black's move 10?", short, "w", undefined, as("b", { onMissing }))).toBeNull();
    expect(resolveQuestionAnchor("move 10?", short, "w", undefined, as("b", { strictDefault: true, onMissing }))).toBeNull();
    expect(missing).toEqual([
      { moveNumber: 10, color: "b" },
      { moveNumber: 10, color: "b" },
    ]);
    // Without strictness a bare move N still falls back, as before.
    expect(resolveQuestionAnchor("move 10?", short, "w", undefined, as("b"))?.index).toBe(18);
  });

  it("the numbered notation decides the ply, and a mis-dotted move of the other side is read as theirs", () => {
    expect(resolveQuestionAnchor("from Black's side, why 8. Nc7+?", MOVES, "w", undefined, as("b"))?.index).toBe(14);
    // 8. Kd8: no king move for White there; Black's 8... Kd8.
    const a = resolveQuestionAnchor("why was 8. Kd8 bad?", MOVES, "w", undefined, as("b"));
    expect(a?.index).toBe(15);
    expect(a?.askedSan).toBeUndefined();
    // Without opts it stays White's 8th with Kd8 as an alternative.
    expect(resolveQuestionAnchor("why was 8. Kd8 bad?", MOVES, "w")?.index).toBe(14);
  });

  it("a bare move prefers the default side's, and reads an owner before it", () => {
    // Both sides' moves: the game has White's Nf3 twice; Black never played it.
    const castles = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6", "d3", "O-O"];
    expect(resolveQuestionAnchor("was O-O a mistake?", castles, "w", 10)?.index).toBe(9);
    expect(resolveQuestionAnchor("was O-O a mistake?", castles, "w", 10, plain("w"))?.index).toBe(9);
    expect(resolveQuestionAnchor("was O-O a mistake?", castles, "w", 10, as("w", { preferDefaultSide: true }))?.index).toBe(6);
    expect(resolveQuestionAnchor("was my O-O a mistake?", castles, "b", 7, as("w"))?.index).toBe(9);
    expect(resolveQuestionAnchor("was Black's O-O a mistake?", castles, "w", 7, as("w"))?.index).toBe(9);
  });
});
