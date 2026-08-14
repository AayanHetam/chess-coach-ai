import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  blendDistribution,
  branchCount,
  configFor,
  generateTheoryLines,
  THEORY_PRESETS,
  type HistoryAtPosition,
  type MoveCandidate,
  type TheoryProviders,
} from "@/lib/scout/theoryLines";

const START = new Chess().fen();

describe("blendDistribution — P(m|v) = w·e + (1−w)·μ", () => {
  const history: HistoryAtPosition = {
    games: 40,
    moves: [
      { move: "c5", probability: 0.6 },
      { move: "e5", probability: 0.3 },
      { move: "e6", probability: 0.1 },
    ],
  };
  const maia: MoveCandidate[] = [
    { move: "c5", probability: 0.45 },
    { move: "e5", probability: 0.35 },
    { move: "e6", probability: 0.12 },
    { move: "d5", probability: 0.05 },
    { move: "Nf6", probability: 0.03 },
  ];

  it("reproduces the worked example at n=40, k=5", () => {
    const out = blendDistribution(history, maia, 5);
    const p = (m: string) => out.find(c => c.move === m)!.probability;

    // w = 40/45 = 0.889
    expect(p("c5")).toBeCloseTo(0.583, 2);
    expect(p("e5")).toBeCloseTo(0.306, 2);
    expect(p("e6")).toBeCloseTo(0.102, 2);
    // Moves they have never played survive only via Maia's share.
    expect(p("d5")).toBeCloseTo(0.006, 2);
  });

  it("is a probability distribution", () => {
    const total = blendDistribution(history, maia, 5).reduce(
      (s, c) => s + c.probability,
      0
    );
    expect(total).toBeCloseTo(1, 6);
  });

  it("weighs history and Maia equally at n = k", () => {
    const out = blendDistribution(
      { games: 5, moves: [{ move: "c5", probability: 1 }] },
      [{ move: "e5", probability: 1 }],
      5
    );
    expect(out.find(c => c.move === "c5")!.probability).toBeCloseTo(0.5, 6);
    expect(out.find(c => c.move === "e5")!.probability).toBeCloseTo(0.5, 6);
  });

  it("is pure Maia with no history, and pure history with no Maia", () => {
    const noHistory = blendDistribution(null, maia, 5);
    expect(noHistory[0].move).toBe("c5");
    expect(noHistory[0].probability).toBeCloseTo(0.45, 2);

    const noMaia = blendDistribution(history, [], 5);
    expect(noMaia.find(c => c.move === "c5")!.probability).toBeCloseTo(0.6, 6);
  });

  it("returns nothing when neither source has an opinion", () => {
    // Fabricating a distribution here would be inventing opening theory.
    expect(blendDistribution(null, [], 5)).toEqual([]);
  });

  it("lets history take over as evidence accumulates", () => {
    const one = blendDistribution({ games: 1, moves: [{ move: "c5", probability: 1 }] }, maia, 5);
    const many = blendDistribution({ games: 100, moves: [{ move: "c5", probability: 1 }] }, maia, 5);

    // One game must not become certainty; 100 games should dominate.
    expect(one.find(c => c.move === "c5")!.probability).toBeLessThan(0.6);
    expect(many.find(c => c.move === "c5")!.probability).toBeGreaterThan(0.94);
  });
});

describe("branchCount — c(v) at τ = 0.70", () => {
  const sorted = (ps: number[]) =>
    ps.map((probability, i) => ({ move: `m${i}`, probability }));

  it("does not split when the top move already clears τ", () => {
    expect(branchCount(sorted([0.92, 0.05, 0.03]), 0.7, 3)).toBe(1);
  });

  it("splits a 50/40 into two", () => {
    expect(branchCount(sorted([0.5, 0.4, 0.1]), 0.7, 3)).toBe(2);
  });

  it("branches less at τ=0.70 than at τ=0.90 — budget goes deeper, not wider", () => {
    const dist = sorted([0.583, 0.306, 0.102, 0.009]);
    expect(branchCount(dist, 0.7, 3)).toBe(2);
    expect(branchCount(dist, 0.9, 3)).toBe(3);
  });

  it("never exceeds Kmax even when they are genuinely random", () => {
    expect(branchCount(sorted([0.17, 0.17, 0.17, 0.17, 0.16, 0.16]), 0.7, 3)).toBe(3);
  });

  it("always opens at least one branch", () => {
    expect(branchCount(sorted([0.4]), 0.7, 3)).toBe(1);
    expect(branchCount([], 0.7, 3)).toBe(0);
  });
});

// ─── Search, with deterministic stub providers ──────────────────────────────

/** Their book: FEN prefix → distribution. Anything else is off-book. */
function makeProviders(opts: {
  book?: Record<string, HistoryAtPosition>;
  maiaFor?: (fen: string) => MoveCandidate[];
  engine?: (fen: string) => string;
}): TheoryProviders & { engineCalls: string[]; maiaCalls: string[] } {
  const engineCalls: string[] = [];
  const maiaCalls: string[] = [];
  return {
    engineCalls,
    maiaCalls,
    history: (fen: string) => opts.book?.[fen] ?? null,
    maia: async (fen: string) => {
      maiaCalls.push(fen);
      return opts.maiaFor ? opts.maiaFor(fen) : [];
    },
    bestMove: async (fen: string) => {
      engineCalls.push(fen);
      if (opts.engine) return opts.engine(fen);
      // Deterministic stand-in for Stockfish, preferring irreversible moves so
      // the stub does not walk in circles.
      return legalMoves(fen)[0];
    },
  };
}

// Stubs must stay legal at every depth — a fixed SAN string is only legal at
// ply 1, which silently truncates every line and makes depth assertions pass
// or fail for the wrong reason.
// Pawn moves first. A stub that picks the alphabetically-first legal move
// shuffles a knight (Na3, Nb1, Na3…), which the repetition guard correctly
// truncates — making every depth assertion fail for a reason that has nothing
// to do with the code under test. Pawn moves are irreversible, so the stub
// makes real progress the way an engine would.
const legalMoves = (fen: string) => {
  const all = new Chess(fen).moves().sort();
  const isPawnMove = (m: string) => /^[a-h]/.test(m);
  return [...all.filter(isPawnMove), ...all.filter(m => !isPawnMove(m))];
};

/** Overwhelmingly prefers one reply, so τ is always cleared: never branches. */
const forcedMaia = () => (fen: string) => [
  { move: legalMoves(fen)[0], probability: 0.95 },
];

/** Spreads evenly over the first `n` legal moves: branches at every node. */
const spreadMaia = (n: number) => (fen: string) =>
  legalMoves(fen)
    .slice(0, n)
    .map(move => ({ move, probability: 1 / n }));

/** Two legal replies with the given split. */
const splitMaia = (a: number, b: number) => (fen: string) => {
  const [m1, m2] = legalMoves(fen);
  return [
    { move: m1, probability: a },
    { move: m2, probability: b },
  ];
};

describe("generateTheoryLines", () => {
  it("stops instead of fabricating when neither history nor Maia has an opinion", async () => {
    const providers = makeProviders({});
    const res = await generateTheoryLines(START, "white", providers, configFor("lite"));

    // You move first, then they are off-model — one line, one ply.
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].stoppedBy).toBe("no-model");
    expect(res.lines[0].moves).toHaveLength(1);
    expect(res.lines[0].moves[0].side).toBe("you");
  });

  it("never asks the engine to move for them", async () => {
    const providers = makeProviders({ maiaFor: forcedMaia() });
    await generateTheoryLines(START, "white", providers, configFor("lite"));

    // Every engine call must be on a position where it is White (you) to move.
    for (const fen of providers.engineCalls) {
      expect(new Chess(fen).turn()).toBe("w");
    }
    expect(providers.engineCalls.length).toBeGreaterThan(0);
  });

  it("follows a forced line without spending budget on splits", async () => {
    const providers = makeProviders({ maiaFor: forcedMaia() });
    const res = await generateTheoryLines(START, "white", providers, configFor("lite"));

    // 0.95 clears τ every time, so it never branches: exactly one deep line.
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].moves.length).toBeGreaterThan(4);
  });

  it("honours the ply cap, allowing one ply for the closing reply", async () => {
    const cfg = { ...configFor("lite"), maxPly: 6 };
    const providers = makeProviders({ maiaFor: forcedMaia() });
    const res = await generateTheoryLines(START, "white", providers, cfg);

    // The walk stops at the cap; if that leaves the line on THEIR move, one
    // more ply is added so the reader gets your answer. The cap is a safety
    // net, not a hard contract on output length.
    expect(res.lines[0].moves.length).toBeGreaterThanOrEqual(6);
    expect(res.lines[0].moves.length).toBeLessThanOrEqual(7);
    expect(res.lines[0].moves[res.lines[0].moves.length - 1].side).toBe("you");
    expect(res.lines[0].stoppedBy).toBe("depth");
  });

  it("never exceeds the line budget", async () => {
    // A genuinely random opponent: branch at every opportunity.
    const spread = spreadMaia(3);
    for (const preset of ["lite", "recommended", "hardcore"] as const) {
      const cfg = { ...configFor(preset), minReach: 0 };
      const res = await generateTheoryLines(
        START,
        "white",
        makeProviders({ maiaFor: spread }),
        cfg
      );
      expect(res.lines.length).toBeLessThanOrEqual(cfg.lineBudget);
    }
  });

  it("prunes lines below ε rather than prepping trivia", async () => {
    const longTail = splitMaia(0.97, 0.03);
    const cfg = { ...configFor("recommended"), minReach: 0.05, maxPly: 4 };
    const res = await generateTheoryLines(
      START,
      "white",
      makeProviders({ maiaFor: longTail }),
      cfg
    );

    // The 3% branch is below ε at every node, so it is never taken: the search
    // stays a single line despite a branchable distribution being offered.
    expect(res.lines).toHaveLength(1);
    for (const line of res.lines) {
      expect(line.reach).toBeGreaterThanOrEqual(cfg.minReach);
    }
  });

  it("reports coverage as the summed reach of the lines it kept", async () => {
    const cfg = { ...configFor("recommended"), maxPly: 2, minReach: 0 };
    const res = await generateTheoryLines(
      START,
      "white",
      makeProviders({ maiaFor: splitMaia(0.6, 0.4) }),
      cfg
    );

    expect(res.coverage).toBeCloseTo(
      res.lines.reduce((s, l) => s + l.reach, 0),
      6
    );
    // Both their replies were covered at depth 2.
    expect(res.coverage).toBeCloseTo(1, 2);
  });

  it("multiplies only their probabilities into reach", async () => {
    const cfg = { ...configFor("recommended"), maxPly: 2, minReach: 0 };
    const res = await generateTheoryLines(
      START,
      "white",
      makeProviders({ maiaFor: splitMaia(0.6, 0.4) }),
      cfg
    );

    const top = res.lines[0];
    // Your move contributes probability 1, so reach equals their move's share.
    expect(top.reach).toBeCloseTo(0.6, 6);
    expect(top.moves.find(m => m.side === "you")!.probability).toBe(1);
  });

  it("ε tightens as the preset gets more thorough", () => {
    expect(THEORY_PRESETS.lite.minReach).toBeGreaterThan(
      THEORY_PRESETS.recommended.minReach
    );
    expect(THEORY_PRESETS.recommended.minReach).toBeGreaterThan(
      THEORY_PRESETS.hardcore.minReach
    );
    expect(THEORY_PRESETS.hardcore.lineBudget).toBeGreaterThan(
      THEORY_PRESETS.lite.lineBudget
    );
  });

  it("produces legal chess throughout", async () => {
    const providers = makeProviders({ maiaFor: forcedMaia() });
    const res = await generateTheoryLines(START, "white", providers, configFor("lite"));

    for (const line of res.lines) {
      const board = new Chess();
      for (const m of line.moves) {
        // Throws if the move is not legal in the position.
        expect(() => board.move(m.san)).not.toThrow();
      }
    }
  });

  it("works when you are Black — they move first", async () => {
    const providers = makeProviders({ maiaFor: forcedMaia() });
    const res = await generateTheoryLines(START, "black", providers, configFor("lite"));

    expect(res.lines[0].moves[0].side).toBe("them");
    for (const fen of providers.engineCalls) {
      expect(new Chess(fen).turn()).toBe("b");
    }
  });
});

describe("budget must never destroy coverage", () => {
  // The invariant that broke: truncating a fork to fit the budget silently
  // discarded the dropped children's probability mass, so asking for MORE
  // lines returned WORSE prep (lite 0.556 → hardcore 0.247). Either fork
  // completely or not at all.
  //
  // Note the fixture: three equal moves, so τ=0.70 takes ALL of them and no
  // mass is pruned. That isolates budget truncation, which is the bug under
  // test. Coverage is NOT monotone in general — with a 0.50/0.35/0.15 opponent
  // the 0.15 branch is deliberately dropped at every node, so deeper prep
  // legitimately sheds reach. Do not generalise this test into "more lines
  // always covers more".
  it("does not lose coverage to budget truncation as the budget grows", async () => {
    const providers = () => makeProviders({ maiaFor: spreadMaia(3) });

    const lite = await generateTheoryLines(START, "white", providers(), configFor("lite"));
    const rec = await generateTheoryLines(START, "white", providers(), configFor("recommended"));
    const hard = await generateTheoryLines(START, "white", providers(), configFor("hardcore"));

    // CONTROL: the opponent really is branchy here, so the budget genuinely
    // binds and this is not passing because nothing ever forked.
    expect(hard.lines.length).toBeGreaterThan(lite.lines.length);

    expect(rec.coverage).toBeGreaterThanOrEqual(lite.coverage - 1e-9);
    expect(hard.coverage).toBeGreaterThanOrEqual(rec.coverage - 1e-9);
  });

  it("keeps total reach at 1 when nothing is pruned by ε", async () => {
    const cfg = { ...configFor("hardcore"), minReach: 0 };
    const res = await generateTheoryLines(
      START,
      "white",
      makeProviders({ maiaFor: spreadMaia(3) }),
      cfg
    );

    // Every path through their distribution is still accounted for somewhere.
    expect(res.coverage).toBeCloseTo(1, 6);
  });

  it("declines a fork it cannot fully fund rather than half-taking it", async () => {
    // Budget 2 cannot pay for a 3-way fork (costs 2 from a single line, landing
    // on 3). With budget 2 the root fork must be refused outright.
    const cfg = { ...configFor("lite"), lineBudget: 2, minReach: 0 };
    const res = await generateTheoryLines(
      START,
      "white",
      makeProviders({ maiaFor: spreadMaia(3) }),
      cfg
    );

    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].stoppedBy).toBe("budget");
    // Refusing the fork must not cost coverage — the line still stands for
    // everything that flows through it.
    expect(res.coverage).toBeCloseTo(1, 6);
  });
});

describe("lines end at the last fork, not at a fixed depth", () => {
  it("always ends on your move, so the reader gets the answer", async () => {
    for (const dist of [spreadMaia(3), splitMaia(0.5, 0.35)]) {
      const res = await generateTheoryLines(
        START,
        "white",
        makeProviders({ maiaFor: dist }),
        configFor("recommended")
      );
      expect(res.lines.length).toBeGreaterThan(1);
      for (const line of res.lines) {
        expect(line.moves[line.moves.length - 1].side).toBe("you");
      }
    }
  });

  it("produces variable-length lines rather than one fixed depth", async () => {
    // Length is emergent from where branching happened — 8 moves or 20, per
    // the spec. A single uniform length would mean depth, not branching, is
    // driving termination.
    const res = await generateTheoryLines(
      START,
      "white",
      makeProviders({ maiaFor: splitMaia(0.5, 0.35) }),
      configFor("hardcore")
    );

    const lengths = new Set(res.lines.map(l => l.moves.length));
    expect(lengths.size).toBeGreaterThan(1);
  });

  it("spends no model call on a node that can no longer fork", async () => {
    const budgeted = makeProviders({ maiaFor: spreadMaia(3) });
    await generateTheoryLines(START, "white", budgeted, configFor("lite"));

    const unbudgeted = makeProviders({ maiaFor: spreadMaia(3) });
    await generateTheoryLines(START, "white", unbudgeted, configFor("hardcore"));

    // A smaller budget must not cost MORE Maia calls — once no fork can be
    // funded the walk stops instead of following forced moves to the cap.
    expect(budgeted.maiaCalls.length).toBeLessThan(unbudgeted.maiaCalls.length);
  });

  it("still runs deep when the opponent is entirely predictable", async () => {
    // Nothing to distinguish, so depth is the only value left; the cap applies.
    const res = await generateTheoryLines(
      START,
      "white",
      makeProviders({ maiaFor: forcedMaia() }),
      configFor("recommended")
    );

    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].moves.length).toBeGreaterThanOrEqual(20);
  });
});

describe("incomplete model output (measured against the live service)", () => {
  // Maia returns a top-5 summing to ~0.71, not 1. Probed 2026-08-14:
  //   1...  Nf6 .278  Nc6 .244  e5 .082  e6 .063  Nh6 .044   Σ = 0.712
  const REAL_MAIA = [
    { move: "Nf6", probability: 0.2777 },
    { move: "Nc6", probability: 0.2442 },
    { move: "e5", probability: 0.0824 },
    { move: "e6", probability: 0.0632 },
    { move: "Nh6", probability: 0.0443 },
  ];

  it("preserves the true mass rather than scaling the tail away", () => {
    const out = blendDistribution(null, REAL_MAIA, 5);
    const total = out.reduce((s, c) => s + c.probability, 0);

    // ~29% of their behaviour is unaccounted for, and that must stay visible.
    expect(total).toBeCloseTo(0.7118, 4);
    expect(out[0].probability).toBeCloseTo(0.2777, 4);
  });

  it("branches on their unpredictability, not on the model's reticence", () => {
    // Raw cumulative never reaches 0.70 until the 5th move, so testing against
    // the unscaled total would drive every node to the Kmax cap.
    expect(branchCount(REAL_MAIA, 0.7, 3)).toBe(2);
  });

  it("keeps reach honest end to end", async () => {
    const cfg = { ...configFor("recommended"), maxPly: 2, minReach: 0 };
    const res = await generateTheoryLines(
      START,
      "white",
      makeProviders({ maiaFor: () => REAL_MAIA }),
      cfg
    );

    // Two branches taken, and their reach is the TRUE probability — so the
    // coverage figure states what it can defend, not 1.0.
    expect(res.coverage).toBeCloseTo(0.2777 + 0.2442, 3);
    expect(res.coverage).toBeLessThan(0.6);
  });

  it("still trusts a complete history over a reticent model", () => {
    const out = blendDistribution(
      { games: 100, moves: [{ move: "c5", probability: 100 }] },
      REAL_MAIA,
      5
    );
    // w = 100/105 ≈ 0.952 of a complete distribution, plus Maia's thin share.
    expect(out.find(c => c.move === "c5")!.probability).toBeGreaterThan(0.95);
  });
});

describe("a line never walks in circles", () => {
  // Found by live-fire probe: with a shuffling engine the search happily
  // produced "1.Na3 Nf6 2.Nb1 Ng8 3.Na3 Nf6..." — prep that teaches nothing.
  const shuffler = (fen: string) => new Chess(fen).moves().sort()[0];

  it("stops rather than repeating a position", async () => {
    const providers = {
      history: () => null,
      maia: async (fen: string) => [
        { move: new Chess(fen).moves().sort()[0], probability: 0.95 },
      ],
      bestMove: async (fen: string) => shuffler(fen),
    };

    const res = await generateTheoryLines(
      START,
      "white",
      providers,
      configFor("recommended")
    );

    for (const line of res.lines) {
      const keys = new Set<string>();
      const board = new Chess();
      keys.add(board.fen().split(" ").slice(0, 4).join(" "));
      for (const m of line.moves) {
        board.move(m.san);
        const key = board.fen().split(" ").slice(0, 4).join(" ");
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
    }
  });
});
