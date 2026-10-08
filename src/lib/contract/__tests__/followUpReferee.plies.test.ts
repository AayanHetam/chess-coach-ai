import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { refereeFollowUp } from "../followUpReferee";
import type { CompactContract, CompactInsight } from "../followUp";

/**
 * A move with a number is licensed only at that number.
 *
 * Live on production, 2026-09-26: asked about 8. Nc7+, the coach wrote
 * "after 8. Qxc1, Black recaptures with 8... Kxc7". There is no knight on c7
 * in that line; Kxc7 is real one move later, in the review's line for
 * 9. Nxa8 (9. Qxc1 Kxc7). The referee accepted any move that appeared
 * anywhere in the licensed lines, whatever its number, so the sentence
 * survived three times in four answers. Now a numbered move must be the
 * game's move at that ply, a licensed line's move at that ply, or a legal
 * alternative there; and once a sentence has placed itself in a line, its
 * following moves are read as that line.
 */

const MOVES = [
  "e4",
  "c5",
  "Nf3",
  "Nc6",
  "d4",
  "cxd4",
  "Nxd4",
  "Qb6",
  "Nf3",
  "Qxb2",
  "Na3",
  "Qxa1",
  "Nb5",
  "Qxc1",
  "Nc7+",
  "Kd8",
  "Nxa8",
  "Qxd1+",
  "Kxd1",
  "e5",
];

function fenAfter(n: number): string {
  const g = new Chess();
  for (let i = 0; i < n; i++) g.move(MOVES[i]);
  return g.fen();
}

function insight(
  over: Partial<CompactInsight> &
    Pick<
      CompactInsight,
      | "moveNumber"
      | "color"
      | "playedSan"
      | "bestSan"
      | "bestLineSan"
      | "fenBefore"
      | "fenAfter"
    >
): CompactInsight {
  return {
    factId: `f${over.moveNumber}${over.color}`,
    colorName: over.color === "w" ? "White" : "Black",
    classification: "blunder",
    evalBeforeDisplay: "+2.84",
    evalAfterDisplay: "-2.11",
    severityDropCp: 495,
    bestLineTruncated: false,
    allowedTacticalKeywords: ["fork", "hanging"],
    motifSayables: [],
    bestLineStory: [],
    gameStory: [],
    relationalSayables: [],
    shipped: true,
    ...over,
  };
}

// The review's two key moments: the fork at move 8 (engine: take the queen)
// and the rook grab at move 9 (engine: take the queen, then Black's king
// takes the knight on c7 — the line "Kxc7" is real in).
const CONTRACT: CompactContract = {
  contractId: "c-plies",
  contractVersion: "1.0",
  playerColor: "w",
  resultText: "Black won",
  finalMaterial: "Black up a bishop",
  accuracy: null,
  insights: [
    insight({
      moveNumber: 8,
      color: "w",
      playedSan: "Nc7+",
      bestSan: "Qxc1",
      bestLineSan: ["Qxc1", "Rb8", "Qf4", "f6"],
      fenBefore: fenAfter(14),
      fenAfter: fenAfter(15),
    }),
    insight({
      moveNumber: 9,
      color: "w",
      playedSan: "Nxa8",
      bestSan: "Qxc1",
      bestLineSan: ["Qxc1", "Kxc7", "Bb5", "f6"],
      fenBefore: fenAfter(16),
      fenAfter: fenAfter(17),
    }),
  ],
  forbiddenClaimClasses: [],
};

const base = {
  compact: CONTRACT,
  activeFen: fenAfter(15),
  activePly: 15,
  moveHistory: MOVES,
  extraFens: [fenAfter(14), fenAfter(15)],
};

describe("refereeFollowUp — a numbered move is licensed only at its own number", () => {
  it("drops the live hallucination: a move borrowed from another key moment's line", () => {
    for (const reply of [
      "Your turn: After 8. Qxc1, Black recaptures with 8... Kxc7. What is White's plan?",
      "After Black recaptures with 8... Kxc7 (the only way to get the knight), you've won Black's queen.",
      "8. Qxc1 Kxc7 — Black's king has to recapture the knight; that's the only legal move.",
    ]) {
      const res = refereeFollowUp({ ...base, reply });
      expect(res.text, reply).not.toContain("Kxc7");
      expect(res.dropped.map((d) => d.reason).join(" ")).toMatch(/san:.*Kxc7/);
    }
  });

  it("keeps the same move where it is real: the move-9 line", () => {
    const res = refereeFollowUp({
      ...base,
      reply: "9. Qxc1 wins the queen, and after Kxc7 the knight is gone.",
    });
    expect(res.text).toContain("Kxc7");
    expect(res.dropped).toEqual([]);
  });

  it("keeps a line the review carries, numbered or continued without numbers", () => {
    const res = refereeFollowUp({
      ...base,
      reply:
        "The engine's line continues 8... Rb8 9. Qf4 f6, and White stays a queen up.",
    });
    expect(res.dropped).toEqual([]);
  });

  it("keeps the game's own moves in sequence", () => {
    const res = refereeFollowUp({
      ...base,
      reply:
        "After 8. Nc7+ Kd8, your knight grabbed the rook on a8, but then Black played 9... Qxd1+ and your queen came off.",
    });
    expect(res.dropped).toEqual([]);
  });

  it("keeps a plain mention of a licensed move in a sentence that walks no line", () => {
    const res = refereeFollowUp({
      ...base,
      reply: "Qxc1 was simply winning, and the fork was the flashier choice.",
    });
    expect(res.dropped).toEqual([]);
  });

  it("drops a legal-looking move given the wrong number", () => {
    // Qf4 is the engine's 9th move in the move-8 line; at move 10 of the
    // game (after 9... Qxd1+) it is nonsense.
    const res = refereeFollowUp({
      ...base,
      reply: "Then 10. Qf4 finishes the attack.",
    });
    expect(res.text).not.toContain("Qf4");
  });

  it("licenses the anchor's engine line by ply when the route passes it", () => {
    const anchorLine = {
      startFen: fenAfter(14),
      startPly: 14,
      sans: ["Qxc1", "Rb8", "Qf4", "Nf6", "Bd3", "a6", "Nc7+", "Kd8"],
    };
    const empty: CompactContract = { ...CONTRACT, insights: [] };
    const kept = refereeFollowUp({
      ...base,
      compact: empty,
      extraLines: [anchorLine],
      reply:
        "After 8. Qxc1 Rb8 9. Qf4 Nf6 10. Bd3 the knight is safe and 11. Nc7+ still comes.",
    });
    expect(kept.dropped).toEqual([]);
    const dropped = refereeFollowUp({
      ...base,
      compact: empty,
      extraLines: [anchorLine],
      reply: "After 8. Qxc1 Kxc7 the knight is gone.",
    });
    expect(dropped.text).not.toContain("Kxc7");
  });
});

describe("refereeFollowUp — a what-if's lines (clientEvals)", () => {
  // The client's search before 8. Nc7+: the alternative, the move played,
  // and the review's best, each with its line, from one position.
  const whatIfLines = [
    {
      startFen: fenAfter(14),
      startPly: 14,
      sans: ["Nd6+", "exd6", "Qxc1", "Nf6"],
      replacing: true,
    },
    {
      startFen: fenAfter(14),
      startPly: 14,
      sans: ["Nc7+", "Kd8", "Nxa8"],
      replacing: true,
    },
    {
      startFen: fenAfter(14),
      startPly: 14,
      sans: ["Qxc1", "Rb8", "Qf4", "Nf6"],
      replacing: true,
    },
  ];
  const withWhatIf = { ...base, extraLines: whatIfLines };

  it("accepts the alternative's line opened with an unnumbered move, which is not legal on the board after the game's move", () => {
    const reply = "Nd6+ exd6 just loses the knight for nothing.";
    expect(refereeFollowUp({ ...base, reply }).dropped).not.toEqual([]);
    expect(refereeFollowUp({ ...withWhatIf, reply }).dropped).toEqual([]);
  });

  it("accepts the alternative's line numbered, and the best line in prose", () => {
    for (const reply of [
      "8. Nd6+ exd6 9. Qxc1 Nf6 gives the knight back for the queen.",
      "Qxc1 Rb8 keeps a whole queen extra.",
    ])
      expect(refereeFollowUp({ ...withWhatIf, reply }).dropped, reply).toEqual(
        []
      );
  });

  it("lends no what-if move to another line at the same ply", () => {
    for (const reply of [
      // exd6 answers 8. Nd6+, not 8. Qxc1.
      "8. Qxc1 exd6 wins.",
      "8. Qxc1 exd6 9. Qxd6 is clean.",
      "Qxc1 exd6 wins.",
    ]) {
      const res = refereeFollowUp({ ...withWhatIf, reply });
      expect(res.dropped.length, reply).toBe(1);
    }
    // The 2026-09-26 borrow stays caught with the what-if's lines in play.
    for (const reply of [
      "After 8. Qxc1, Black recaptures with 8... Kxc7.",
      "8. Qxc1 Kxc7 — Black's king has to recapture the knight.",
    ]) {
      const res = refereeFollowUp({ ...withWhatIf, reply });
      expect(res.text, reply).not.toContain("Kxc7");
    }
  });

  it("does not open a replacing line in the middle of a sentence that already walked", () => {
    // After the game's 8... Kd8 the board is White's; Nd6+ is not a move of
    // that board, and the what-if line opens only at its start.
    const res = refereeFollowUp({
      ...withWhatIf,
      reply: "After Kd8, Nd6+ exd6 follows.",
    });
    expect(res.dropped.length).toBe(1);
  });

  it("opens the what-if's line from its root even when the block names the move asked about", () => {
    // The anchor block says "The player asks about Nd6+", which puts Nd6+
    // in the pool; read with the roots first, its line is walked.
    const named = {
      ...withWhatIf,
      extraLicensedText:
        "The player asks about Nd6+ as an alternative at this point.",
    };
    expect(
      refereeFollowUp({ ...named, reply: "Nd6+ exd6 just loses the knight." })
        .dropped
    ).toEqual([]);
    expect(
      refereeFollowUp({
        ...base,
        extraLicensedText: named.extraLicensedText,
        reply: "Nd6+ exd6 just loses the knight.",
      }).dropped.map((d) => d.reason)
    ).toEqual(["san:exd6"]);
  });

  it("on the what-if's own line, every move is that line's next move: nothing is borrowed after the root", () => {
    for (const reply of [
      // 9. Nxa8 is the game's move after 8. Nc7+ Kd8, not after 8. Nd6+ exd6.
      "Nd6+ exd6 Nxa8 grabs the rook anyway.",
      "Nd6+ exd6 9. Nxa8 grabs the rook anyway.",
      // 9. Qxc1 is the move-9 key moment's, after 8... Kd8.
      "Nd6+ exd6 9. Qxc1 Kxc7 is the same story.",
    ])
      expect(
        refereeFollowUp({ ...withWhatIf, reply }).dropped.length,
        reply
      ).toBe(1);
    expect(
      refereeFollowUp({
        ...withWhatIf,
        reply: "Nd6+ exd6 Qxc1 Nf6 gives the knight back for the queen.",
      }).dropped
    ).toEqual([]);
  });

  it("a root is matched as written: the bishop's Bxc4 is not the pawn's bxc4", () => {
    // 1.b3 Nc6 2.e3 Ne5 3.Nc3 Nc4 4.bxc4: the bishop could have taken. Only
    // with the bishop on c4 is 5. Ba6 a move after 4... Nf6.
    const B3 = "b3 Nc6 e3 Ne5 Nc3 Nc4 bxc4".split(" ");
    const at = (n: number) => {
      const g = new Chess();
      for (const m of B3.slice(0, n)) g.move(m);
      return g.fen();
    };
    const b3 = {
      compact: { ...CONTRACT, insights: [] },
      activeFen: at(7),
      activePly: 7,
      moveHistory: B3,
      extraFens: [at(6), at(7)],
      extraLines: [
        {
          startFen: at(6),
          startPly: 6,
          sans: ["Bxc4", "Nf6"],
          replacing: true,
        },
      ],
    };
    expect(
      refereeFollowUp({ ...b3, reply: "Bxc4 Nf6 Ba6 is the idea." }).dropped
    ).toEqual([]);
    expect(
      refereeFollowUp({ ...b3, reply: "bxc4 Nf6 Ba6 is the idea." }).dropped
        .length
    ).toBe(1);
  });

  it("a root opens after nothing but the move it replaces", () => {
    expect(
      refereeFollowUp({
        ...withWhatIf,
        reply: "After Nxa8, Nd6+ exd6 follows.",
      }).dropped.length
    ).toBe(1);
    expect(
      refereeFollowUp({
        ...withWhatIf,
        reply: "Instead of Nc7+, Nd6+ exd6 just loses the knight.",
      }).dropped
    ).toEqual([]);
  });

  it("a what-if's number is licensed only beside its own move", () => {
    const tied = {
      ...withWhatIf,
      licensedEvals: ["+2.84"],
      licensedEvalsByMove: [
        { eval: "+2.51", san: "Qxc1" },
        { eval: "-0.97", san: "Nc7+" },
      ],
    };
    expect(
      refereeFollowUp({ ...tied, reply: "8. Qxc1 keeps White at +2.51 here." })
        .dropped
    ).toEqual([]);
    expect(
      refereeFollowUp({
        ...tied,
        reply: "8. Nc7+ keeps White at +2.51 here.",
      }).dropped.map((d) => d.reason)
    ).toEqual(["eval:+2.51"]);
  });

  it("keeps the sentences that name the game's move beside the alternative", () => {
    for (const reply of [
      "Nc7+ looked flashy, but Qxc1 simply wins the queen.",
      "Rather than Nc7+, play Qxc1.",
      "Instead of Nc7+, Qxc1 Rb8 keeps a whole queen extra.",
      "Nc7+ forks king and rook, and after Nxa8 White gets only a rook for the queen.",
    ])
      expect(refereeFollowUp({ ...withWhatIf, reply }).dropped, reply).toEqual(
        []
      );
  });

  it("never costs a sentence: what the referee keeps without the what-if, it keeps with it", () => {
    const corpus = [
      "8. Nc7+ forked king and rook, but 9. Qxc1 was better than 9. Nxa8.",
      "8. Nc7+ was the mistake, and 9. Qxc1 could still have saved it.",
      "The engine wanted 8. Qxc1, and a move later 9. Qxc1 was still there.",
      "8. Qxc1 wins material, while 9. Nxa8 in the game lost the queen.",
      "8. Qxc1 Rb8 keeps the queen, while the game's 9. Nxa8 grabbed only a rook.",
      "After 8. Qxc1 Rb8 9. Qf4 is good; if 8... Kd8 instead, 9. Qf4 still wins.",
      "Qxc1 was Black's greedy grab, and Nc7+ forks the king and rook.",
      "After 8. Qxc1, Black recaptures with 8... Kxc7.",
      "8. Nd6+ exd6 9. Qxc1 Nf6 gives the knight back for the queen.",
      "Kd8 Nxa8 Qxd1+ Kxd1 is how the game went.",
    ];
    for (const reply of corpus) {
      const without = refereeFollowUp({ ...base, reply });
      const withIt = refereeFollowUp({ ...withWhatIf, reply });
      if (without.dropped.length === 0)
        expect(withIt.dropped, reply).toEqual([]);
      // A sentence about the game alone reads the same either way.
      if (!/Nd6/.test(reply)) expect(withIt.text, reply).toBe(without.text);
    }
    // The contrast sentences above are kept: every move in them is
    // licensed at its own number.
    for (const reply of corpus.slice(0, 6))
      expect(refereeFollowUp({ ...base, reply }).dropped, reply).toEqual([]);
  });

  it("licenses the what-if's numbers passed structurally, mid-sentence", () => {
    const reply = "8. Nd6+ comes out at -1.30, so it is no improvement.";
    expect(
      refereeFollowUp({ ...withWhatIf, reply, licensedEvals: ["+2.84"] })
        .dropped
    ).not.toEqual([]);
    expect(
      refereeFollowUp({
        ...withWhatIf,
        reply,
        licensedEvals: ["+2.84", "-1.30"],
      }).dropped
    ).toEqual([]);
  });
});
