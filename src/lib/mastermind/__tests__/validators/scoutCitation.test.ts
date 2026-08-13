import { describe, it, expect } from "vitest";
import {
  validateScoutCitation,
  countScoutOpportunities,
  SCOUT_TOLERANCE,
  type ParserCall,
  type ParsedScoutClaim,
  type ScoutClaimType,
} from "@/lib/mastermind/validators";
import type {
  ScoutAnalytics,
  Collisions,
} from "@/types/scout";

// ──────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────────

function emptyScout(): ScoutAnalytics {
  return {
    profile: {
      ovr: 50, atk: 50, def: 50, time: 50, mind: 50,
      ratings: {},
      totalGames: 0,
      spanDays: 0,
      recent: [],
      recentAccuracy: 0,
      winRate: 0,
      drawRate: 0,
      lossRate: 0,
      archetype: "",
      phaseElo: { baseline: 1500, opening: 1500, middle: 1500, endgame: 1500 },
    },
    tells: { total: 0, predictability: "Low", factors: [] },
    prep: {
      asWhite: { weaknesses: [], strengths: [] },
      asBlack: { weaknesses: [], strengths: [] },
    },
    checklist: [],
    rivals: [],
    psychology: {
      avgGameLength: 0,
      quickLossRate: 0,
      longGameLossRate: 0,
      timeoutRate: 0,
      resignRate: 0,
      checkmateRate: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      tiltAfterLossLossRate: 0,
    },
    recentBuckets: [],
    novelty: [],
  };
}

function richScout(): ScoutAnalytics {
  return {
    profile: {
      ovr: 78, atk: 72, def: 65, time: 80, mind: 70,
      ratings: { bullet: 1700, blitz: 1750, rapid: 1820, classical: 1900, daily: 1600 },
      totalGames: 250,
      spanDays: 365,
      recent: Array(10)
        .fill(null)
        .map((_, i) => ({ outcome: i < 6 ? "win" : i < 8 ? "draw" : "loss", date: i }) as const),
      recentAccuracy: 80,
      winRate: 0.55,
      drawRate: 0.2,
      lossRate: 0.25,
      archetype: "positional grinder",
      latestRating: 1820,
      peakRating: 2050,
      lowRating: 1750,
      phaseElo: { baseline: 1820, opening: 1900, middle: 1820, endgame: 1620 },
    },
    tells: {
      total: 72,
      predictability: "High",
      factors: [
        { id: "tilts", label: "Tilts after a loss", score: 80 },
        { id: "time_trouble", label: "Time pressure issues", score: 65 },
      ],
    },
    prep: {
      asWhite: {
        weaknesses: [
          { eco: "B90", name: "Sicilian Najdorf", variation: "English Attack", moves: [], totalGames: 30, scorePct: 41, wins: 10, draws: 5, losses: 15 },
        ],
        strengths: [
          { eco: "C60", name: "Ruy Lopez", variation: "Main Line", moves: [], totalGames: 20, scorePct: 70, wins: 13, draws: 3, losses: 4 },
        ],
      },
      asBlack: {
        weaknesses: [
          { eco: "D02", name: "London System", variation: "", moves: [], totalGames: 15, scorePct: 35, wins: 4, draws: 3, losses: 8 },
        ],
        strengths: [
          { eco: "B23", name: "Sicilian Defense", variation: "Najdorf", moves: [], totalGames: 38, scorePct: 64, wins: 22, draws: 8, losses: 8 },
        ],
      },
    },
    checklist: [
      { id: "kingside_attack", title: "Watch kingside pawn storm", detail: "...", severity: "high" },
      { id: "endgame_weak", title: "Endgame technique weak", detail: "...", severity: "medium" },
    ],
    rivals: [
      { name: "Vinod_kk", games: 8, wins: 3, draws: 2, losses: 3, scorePct: 50 },
      { name: "AnotherRival", games: 5, wins: 1, draws: 2, losses: 2, scorePct: 40 },
    ],
    psychology: {
      avgGameLength: 60,
      quickLossRate: 12,
      longGameLossRate: 35,
      timeoutRate: 15,
      resignRate: 60,
      checkmateRate: 25,
      maxWinStreak: 14,
      maxLossStreak: 7,
      tiltAfterLossLossRate: 68,
    },
    recentBuckets: [
      { label: "last 20", wins: 12, draws: 3, losses: 5 },
      { label: "last 50", wins: 28, draws: 12, losses: 10 },
    ],
    novelty: [
      {
        moves: ["e4", "c5", "Nf3"],
        playedMove: "Nf6",
        bookMove: "d6",
        bookFrequency: 0.7,
        totalGames: 10,
        ply: 8,
        gameLost: true,
        gameId: "game-xyz",
        eco: "B40",
        name: "Sicilian Defense",
        variation: "...",
      },
    ],
  };
}

function emptyCollisions(): Collisions {
  return {
    whenYouPlayWhite: [],
    whenYouPlayBlack: [],
    yourWinRate: 0.5,
    yourGames: 0,
    yourUsername: "user",
  };
}

function richCollisions(): Collisions {
  return {
    whenYouPlayWhite: [
      {
        moves: ["e4", "c6"],
        eco: "B10",
        name: "Caro-Kann",
        variation: "Main Line",
        yourColor: "white",
        yourScorePct: 65,
        yourGames: 10,
        theirScorePct: 35,
        theirGames: 10,
        edge: 30,
      },
    ],
    whenYouPlayBlack: [
      {
        moves: ["d4", "Nf6"],
        eco: "E60",
        name: "King's Indian",
        variation: "Classical",
        yourColor: "black",
        yourScorePct: 55,
        yourGames: 8,
        theirScorePct: 45,
        theirGames: 8,
        edge: 10,
      },
    ],
    yourWinRate: 0.6,
    yourGames: 18,
    yourUsername: "user",
  };
}

function mockParser(claims: ParsedScoutClaim[]): ParserCall {
  return async () => ({ raw: JSON.stringify(claims), costUsd: 0 });
}

function malformedParser(raw: string): ParserCall {
  return async () => ({ raw, costUsd: 0 });
}

function runValidator(
  scout: ScoutAnalytics,
  parserOutput: ParsedScoutClaim[],
  collisions?: Collisions,
  opts?: Partial<{ confidenceThreshold: number; opponentUsername: string }>
) {
  return validateScoutCitation({
    llmResponse: parserOutput.map((c) => c.claim_text).join(" "),
    scout,
    collisions,
    opponentUsername: opts?.opponentUsername ?? "opponent_name",
    correlationId: "test",
    confidenceThreshold: opts?.confidenceThreshold,
    parseCall: mockParser(parserOutput),
  });
}

function factualClaim(
  claim_type: ScoutClaimType,
  expected_in_data: ParsedScoutClaim["expected_in_data"],
  claim_text = "test claim",
  confidence = 0.95
): ParsedScoutClaim {
  return {
    claim_text,
    claim_type,
    expected_in_data,
    claim_class: "factual_scouting_claim",
    confidence,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// §3.1 Opening / prep — 3 claim types × 3 tests = 9
// ──────────────────────────────────────────────────────────────────────────

describe("scoutCitation: opening / prep claims", () => {
  describe("opponent_plays_opening", () => {
    it("matches when stated frequency is within ±5pp of computed", async () => {
      // Total games across all 4 entries = 30 + 20 + 15 + 38 = 103. Najdorf strengths asBlack = 38.
      // 38/103 = 36.9%. Coach says ~37%.
      const scout = richScout();
      const r = await runValidator(scout, [
        factualClaim("opponent_plays_opening", { opening_name: "Najdorf", stated_pct: 37 }),
      ]);
      expect(r.passed).toBe(true);
      expect(r.issues).toHaveLength(0);
    });

    it("fires when stated frequency is outside tolerance", async () => {
      const scout = richScout();
      const r = await runValidator(scout, [
        factualClaim("opponent_plays_opening", { opening_name: "Najdorf", stated_pct: 80 }),
      ]);
      expect(r.passed).toBe(false);
      expect(r.issues[0].check_name).toBe("scout_citation_unsupported");
    });

    it("fires when scout data has no matching opening", async () => {
      const scout = emptyScout();
      const r = await runValidator(scout, [
        factualClaim("opponent_plays_opening", { opening_name: "Najdorf", stated_pct: 60 }),
      ]);
      expect(r.passed).toBe(false);
    });

    // Unhinted-claim handling (Aayan 2026-05-18). Three paths:
    it("Path A: unhinted claim — Najdorf at ≥5% frequency → passes (no stated_pct)", async () => {
      // richScout: Sicilian Najdorf in asWhite.weaknesses (30 games) + Sicilian
      // Defense Najdorf in asBlack.strengths (38 games). Total pool ~103 games.
      // Either Najdorf is well above 5% baseline.
      const r = await runValidator(richScout(), [
        factualClaim("opponent_plays_opening", { opening_name: "Najdorf" }),
      ]);
      expect(r.passed).toBe(true);
    });

    it("Path B: unhinted claim — Najdorf at near-zero frequency → fires (below baseline)", async () => {
      const scout = richScout();
      // Replace Najdorf entries with low-frequency ones; keep other openings high
      // so the Najdorf falls below the 5% baseline of the total pool.
      scout.prep.asWhite.weaknesses = [
        { eco: "B90", name: "Sicilian Najdorf", variation: "", moves: [], totalGames: 1, scorePct: 0, wins: 0, draws: 0, losses: 1 },
      ];
      scout.prep.asBlack.strengths = []; // remove the high-frequency Najdorf entry
      // Total pool now: 1 (Najdorf) + 20 (Ruy Lopez) + 15 (London) = 36 games
      // Najdorf frequency = 1/36 = 2.8% < 5% baseline → fires.
      const r = await runValidator(scout, [
        factualClaim("opponent_plays_opening", { opening_name: "Najdorf" }),
      ]);
      expect(r.passed).toBe(false);
    });

    it("Path C: unhinted claim — no Najdorf data at all → fires (no match)", async () => {
      const scout = richScout();
      scout.prep.asWhite.weaknesses = scout.prep.asWhite.weaknesses.filter(
        (o) => !`${o.name} ${o.variation}`.toLowerCase().includes("najdorf")
      );
      scout.prep.asBlack.strengths = scout.prep.asBlack.strengths.filter(
        (o) => !`${o.name} ${o.variation}`.toLowerCase().includes("najdorf")
      );
      const r = await runValidator(scout, [
        factualClaim("opponent_plays_opening", { opening_name: "Najdorf" }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("opponent_strength_opening", () => {
    it("matches when stated score % is within tolerance", async () => {
      // Ruy Lopez in asWhite.strengths: scorePct 70. Coach says 72.
      const scout = richScout();
      const r = await runValidator(scout, [
        factualClaim("opponent_strength_opening", { opening_name: "Ruy Lopez", opponent_color: "white", stated_pct: 72 }),
      ]);
      expect(r.passed).toBe(true);
    });

    it("fires on out-of-tolerance score %", async () => {
      const scout = richScout();
      const r = await runValidator(scout, [
        factualClaim("opponent_strength_opening", { opening_name: "Ruy Lopez", opponent_color: "white", stated_pct: 90 }),
      ]);
      expect(r.passed).toBe(false);
    });

    it("fires when the cited opening is not in strengths", async () => {
      const scout = richScout();
      const r = await runValidator(scout, [
        factualClaim("opponent_strength_opening", { opening_name: "Caro-Kann", stated_pct: 70 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("opponent_weakness_opening", () => {
    it("matches when stated weakness score % is within tolerance", async () => {
      // London System asBlack.weaknesses: scorePct 35. Coach says 38.
      const scout = richScout();
      const r = await runValidator(scout, [
        factualClaim("opponent_weakness_opening", { opening_name: "London", opponent_color: "black", stated_pct: 38 }),
      ]);
      expect(r.passed).toBe(true);
    });

    it("fires on out-of-tolerance", async () => {
      const scout = richScout();
      const r = await runValidator(scout, [
        factualClaim("opponent_weakness_opening", { opening_name: "London", stated_pct: 50 }),
      ]);
      expect(r.passed).toBe(false);
    });

    it("fires when the cited opening is not in weaknesses", async () => {
      const scout = richScout();
      const r = await runValidator(scout, [
        factualClaim("opponent_weakness_opening", { opening_name: "Nimzo-Indian", stated_pct: 40 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// §3.2 Profile — 8 claim types × 3 tests = 24
// ──────────────────────────────────────────────────────────────────────────

describe("scoutCitation: profile claims", () => {
  describe("archetype", () => {
    it("matches on substring", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("archetype", { stated_archetype: "grinder" }),
      ]);
      expect(r.passed).toBe(true);
    });

    it("fires on completely-different archetype", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("archetype", { stated_archetype: "tactical sniper" }),
      ]);
      expect(r.passed).toBe(false);
    });

    it("fires when stated_archetype is absent from the parser output", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("archetype", {}),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("profile_dimension", () => {
    it("matches when stated value is within ±5 of actual", async () => {
      // atk = 72, claim 75
      const r = await runValidator(richScout(), [
        factualClaim("profile_dimension", { dimension: "atk", stated_value: 75 }),
      ]);
      expect(r.passed).toBe(true);
    });

    it("fires on out-of-tolerance", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("profile_dimension", { dimension: "atk", stated_value: 90 }),
      ]);
      expect(r.passed).toBe(false);
    });

    it("fires when dimension is missing", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("profile_dimension", { stated_value: 75 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("rating_by_timeclass", () => {
    it("matches when rating within ±25 of actual", async () => {
      // rapid = 1820, claim 1835
      const r = await runValidator(richScout(), [
        factualClaim("rating_by_timeclass", { time_class: "rapid", stated_rating: 1835 }),
      ]);
      expect(r.passed).toBe(true);
    });

    it("fires on out-of-tolerance rating", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("rating_by_timeclass", { time_class: "rapid", stated_rating: 2000 }),
      ]);
      expect(r.passed).toBe(false);
    });

    it("fires when time_class is absent from the scout's ratings", async () => {
      const scout = richScout();
      delete scout.profile.ratings.bullet;
      const r = await runValidator(scout, [
        factualClaim("rating_by_timeclass", { time_class: "bullet", stated_rating: 1700 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("peak_rating", () => {
    it("matches within ±25", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("peak_rating", { stated_rating: 2055 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires on far-off claim", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("peak_rating", { stated_rating: 2200 }),
      ]);
      expect(r.passed).toBe(false);
    });
    it("fires when scout has no peakRating", async () => {
      const scout = richScout();
      delete scout.profile.peakRating;
      const r = await runValidator(scout, [
        factualClaim("peak_rating", { stated_rating: 2050 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("low_rating", () => {
    it("matches", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("low_rating", { stated_rating: 1760 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires on far-off", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("low_rating", { stated_rating: 1500 }),
      ]);
      expect(r.passed).toBe(false);
    });
    it("fires when absent", async () => {
      const scout = richScout();
      delete scout.profile.lowRating;
      const r = await runValidator(scout, [
        factualClaim("low_rating", { stated_rating: 1750 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("latest_rating", () => {
    it("matches", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("latest_rating", { stated_rating: 1820 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires on far-off", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("latest_rating", { stated_rating: 1500 }),
      ]);
      expect(r.passed).toBe(false);
    });
    it("fires when absent", async () => {
      const scout = richScout();
      delete scout.profile.latestRating;
      const r = await runValidator(scout, [
        factualClaim("latest_rating", { stated_rating: 1820 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("recent_form_trend", () => {
    it("matches W/D/L within ±1", async () => {
      // recent[] has 6W 2D 2L (last 10)
      const r = await runValidator(richScout(), [
        factualClaim("recent_form_trend", { stated_value: 10, stated_wins: 6, stated_draws: 2, stated_losses: 2 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires when stated wins is off by more than 1", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("recent_form_trend", { stated_value: 10, stated_wins: 9 }),
      ]);
      expect(r.passed).toBe(false);
    });
    it("fires when nothing is stated", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("recent_form_trend", {}),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("phase_elo", () => {
    it("matches direct phase rating within ±25", async () => {
      // endgame = 1620, claim 1640
      const r = await runValidator(richScout(), [
        factualClaim("phase_elo", { phase: "endgame", stated_rating: 1640 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("matches phase-vs-baseline delta within ±50", async () => {
      // baseline 1820, endgame 1620, delta 200. Claim 220.
      const r = await runValidator(richScout(), [
        factualClaim("phase_elo", { phase: "endgame", stated_value: 220 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires on far-off delta", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("phase_elo", { phase: "endgame", stated_value: 500 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// §3.3 Tells — 2 claim types × 3 tests = 6
// ──────────────────────────────────────────────────────────────────────────

describe("scoutCitation: tells claims", () => {
  describe("tells_total", () => {
    it("matches within ±5", async () => {
      // total 72, claim 75
      const r = await runValidator(richScout(), [
        factualClaim("tells_total", { stated_value: 75 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires on out-of-tolerance", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("tells_total", { stated_value: 95 }),
      ]);
      expect(r.passed).toBe(false);
    });
    it("fires when no value is stated", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("tells_total", {}),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("tells_factor", () => {
    it("matches factor by id + score", async () => {
      // tilts factor score 80, claim 78
      const r = await runValidator(richScout(), [
        factualClaim("tells_factor", { factor_id: "tilts", stated_value: 78 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires when factor is absent from the array", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("tells_factor", { factor_id: "limited_rep", stated_value: 60 }),
      ]);
      expect(r.passed).toBe(false);
    });
    it("matches existence-only when no value is stated", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("tells_factor", { factor_id: "tilts" }),
      ]);
      expect(r.passed).toBe(true);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// §3.4 Psychology — 8 claim types × 3 tests = 24
// ──────────────────────────────────────────────────────────────────────────

describe("scoutCitation: psychology claims", () => {
  const rateCases: Array<{ claim_type: ScoutClaimType; field: keyof ScoutAnalytics["psychology"]; actual: number }> = [
    { claim_type: "tilt_pattern", field: "tiltAfterLossLossRate", actual: 68 },
    { claim_type: "timeout_pattern", field: "timeoutRate", actual: 15 },
    { claim_type: "resign_pattern", field: "resignRate", actual: 60 },
    { claim_type: "checkmate_rate", field: "checkmateRate", actual: 25 },
    { claim_type: "quick_loss_pattern", field: "quickLossRate", actual: 12 },
    { claim_type: "long_game_pattern", field: "longGameLossRate", actual: 35 },
  ];

  for (const tc of rateCases) {
    describe(tc.claim_type, () => {
      it(`matches within ±5pp of actual ${tc.field}`, async () => {
        const r = await runValidator(richScout(), [
          factualClaim(tc.claim_type, { stated_pct: tc.actual + 3 }),
        ]);
        expect(r.passed).toBe(true);
      });
      it("fires on out-of-tolerance %", async () => {
        const r = await runValidator(richScout(), [
          factualClaim(tc.claim_type, { stated_pct: tc.actual + 30 }),
        ]);
        expect(r.passed).toBe(false);
      });
      it("fires when stated_pct is absent", async () => {
        const r = await runValidator(richScout(), [
          factualClaim(tc.claim_type, {}),
        ]);
        expect(r.passed).toBe(false);
      });
    });
  }

  describe("streak_claim", () => {
    it("matches max win streak", async () => {
      // maxWinStreak = 14, claim 14
      const r = await runValidator(richScout(), [
        factualClaim("streak_claim", { stated_value: 14 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("matches max loss streak", async () => {
      // maxLossStreak = 7, claim 8 (within ±1)
      const r = await runValidator(richScout(), [
        factualClaim("streak_claim", { stated_value: 8 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires when value matches neither streak", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("streak_claim", { stated_value: 30 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("avg_game_length", () => {
    it("matches within ±10 plies", async () => {
      // avgGameLength 60, claim 65
      const r = await runValidator(richScout(), [
        factualClaim("avg_game_length", { stated_value: 65 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires on far-off", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("avg_game_length", { stated_value: 100 }),
      ]);
      expect(r.passed).toBe(false);
    });
    it("fires when stated_value is absent", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("avg_game_length", {}),
      ]);
      expect(r.passed).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// §3.5 Rivals / collisions / novelty / checklist / recent-form — 5 × 3 = 15
// ──────────────────────────────────────────────────────────────────────────

describe("scoutCitation: rivals/collisions/novelty/checklist/recent-form", () => {
  describe("rival_record", () => {
    it("matches by rival name + W/D/L counts", async () => {
      // Vinod_kk: 3W 2D 3L. Coach says 3-2-3.
      const r = await runValidator(richScout(), [
        factualClaim("rival_record", { rival_name: "Vinod_kk", stated_wins: 3, stated_draws: 2, stated_losses: 3 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires when W/D/L counts mismatch", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("rival_record", { rival_name: "Vinod_kk", stated_wins: 7 }),
      ]);
      expect(r.passed).toBe(false);
    });
    it("fires when rival is not in the array", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("rival_record", { rival_name: "Unknown_player", stated_wins: 3 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("collision_edge", () => {
    it("matches collision by color + opening + score", async () => {
      // whenYouPlayWhite Caro-Kann yourScorePct 65, claim 68
      const r = await runValidator(richScout(), [
        factualClaim("collision_edge", { your_color: "white", opening_name: "Caro-Kann", stated_pct: 68 }),
      ], richCollisions());
      expect(r.passed).toBe(true);
    });
    it("fires when collision opening is not in the color's lines", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("collision_edge", { your_color: "white", opening_name: "Sicilian", stated_pct: 65 }),
      ], richCollisions());
      expect(r.passed).toBe(false);
    });
    it("fires when collisions data is absent entirely", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("collision_edge", { your_color: "white", opening_name: "Caro-Kann", stated_pct: 65 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("novelty_finding", () => {
    it("matches by gameId", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("novelty_finding", { novelty_game_id: "game-xyz" }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("matches by playedMove + ply", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("novelty_finding", { novelty_played_move: "Nf6", novelty_ply: 8 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires when neither id nor playedMove matches", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("novelty_finding", { novelty_game_id: "game-zzz" }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("checklist_item", () => {
    it("matches by title substring", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("checklist_item", { checklist_title: "kingside" }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("matches by exact id", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("checklist_item", { checklist_title: "endgame_weak" }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires when no checklist entry matches", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("checklist_item", { checklist_title: "blunder_prone" }),
      ]);
      expect(r.passed).toBe(false);
    });
  });

  describe("recent_form_bucket", () => {
    it("matches by label substring + counts", async () => {
      // "last 20": 12W 3D 5L
      const r = await runValidator(richScout(), [
        factualClaim("recent_form_bucket", { form_bucket_label: "last 20", stated_wins: 12, stated_draws: 3, stated_losses: 5 }),
      ]);
      expect(r.passed).toBe(true);
    });
    it("fires when counts mismatch beyond ±1", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("recent_form_bucket", { form_bucket_label: "last 20", stated_wins: 18 }),
      ]);
      expect(r.passed).toBe(false);
    });
    it("fires when label has no matching bucket", async () => {
      const r = await runValidator(richScout(), [
        factualClaim("recent_form_bucket", { form_bucket_label: "last 5", stated_wins: 3 }),
      ]);
      expect(r.passed).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Cross-cutting integration tests
// ──────────────────────────────────────────────────────────────────────────

describe("scoutCitation: cross-cutting integration", () => {
  it("opening matching: color disambiguation — no color hint scans both colors", async () => {
    const scout = richScout();
    const r = await runValidator(scout, [
      factualClaim("opponent_strength_opening", { opening_name: "Sicilian Najdorf", stated_pct: 64 }),
    ]);
    // asBlack.strengths has Sicilian Najdorf at 64% — should match without naming color
    expect(r.passed).toBe(true);
  });

  it("opening matching: ECO match takes precedence over name", async () => {
    const scout = richScout();
    const r = await runValidator(scout, [
      factualClaim("opponent_plays_opening", { opening_eco: "B23", stated_pct: 37 }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("substring matching: 'Najdorf' matches 'Sicilian Najdorf Variation'", async () => {
    const scout = richScout();
    const r = await runValidator(scout, [
      factualClaim("opponent_strength_opening", { opening_name: "Najdorf", stated_pct: 64 }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("substring matching: 'Italian Game' does NOT match 'Sicilian Najdorf'", async () => {
    const scout = richScout();
    const r = await runValidator(scout, [
      factualClaim("opponent_strength_opening", { opening_name: "Italian Game", stated_pct: 64 }),
    ]);
    expect(r.passed).toBe(false);
  });

  it("tolerance edge: rating diff exactly at ±25 passes", async () => {
    // peakRating 2050, claim 2075 → diff 25 = tolerance
    const r = await runValidator(richScout(), [
      factualClaim("peak_rating", { stated_rating: 2075 }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("tolerance edge: rating diff at ±26 fires", async () => {
    const r = await runValidator(richScout(), [
      factualClaim("peak_rating", { stated_rating: 2076 }),
    ]);
    expect(r.passed).toBe(false);
  });

  it("tolerance edge: % diff exactly at ±5 passes", async () => {
    // timeoutRate 15, claim 20 → diff 5 = tolerance
    const r = await runValidator(richScout(), [
      factualClaim("timeout_pattern", { stated_pct: 20 }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("dimension dispatch: each of ovr/atk/def/time/mind reads the right field", async () => {
    const scout = richScout();
    // ovr=78 atk=72 def=65 time=80 mind=70
    const checks: Array<["ovr" | "atk" | "def" | "time" | "mind", number]> = [
      ["ovr", 78], ["atk", 72], ["def", 65], ["time", 80], ["mind", 70],
    ];
    for (const [dim, actual] of checks) {
      const r = await runValidator(scout, [
        factualClaim("profile_dimension", { dimension: dim, stated_value: actual }),
      ]);
      expect(r.passed).toBe(true);
    }
  });

  it("time_class dispatch: each of bullet/blitz/rapid/classical/daily reads the right rating", async () => {
    const scout = richScout();
    const checks: Array<["bullet" | "blitz" | "rapid" | "classical" | "daily", number]> = [
      ["bullet", 1700], ["blitz", 1750], ["rapid", 1820], ["classical", 1900], ["daily", 1600],
    ];
    for (const [tc, rating] of checks) {
      const r = await runValidator(scout, [
        factualClaim("rating_by_timeclass", { time_class: tc, stated_rating: rating }),
      ]);
      expect(r.passed).toBe(true);
    }
  });

  it("tells factor id dispatch: each factor id reads the right factor entry", async () => {
    const scout = richScout();
    // tilts=80, time_trouble=65
    const r1 = await runValidator(scout, [
      factualClaim("tells_factor", { factor_id: "tilts", stated_value: 80 }),
    ]);
    expect(r1.passed).toBe(true);
    const r2 = await runValidator(scout, [
      factualClaim("tells_factor", { factor_id: "time_trouble", stated_value: 65 }),
    ]);
    expect(r2.passed).toBe(true);
  });

  it("collision color dispatch: white reads whenYouPlayWhite, black reads whenYouPlayBlack", async () => {
    const collisions = richCollisions();
    const r1 = await runValidator(richScout(), [
      factualClaim("collision_edge", { your_color: "white", opening_name: "Caro-Kann", stated_pct: 65 }),
    ], collisions);
    expect(r1.passed).toBe(true);
    const r2 = await runValidator(richScout(), [
      factualClaim("collision_edge", { your_color: "black", opening_name: "King's Indian", stated_pct: 55 }),
    ], collisions);
    expect(r2.passed).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Adversarial / edge cases
// ──────────────────────────────────────────────────────────────────────────

describe("scoutCitation: adversarial + edge cases", () => {
  it("qualitative_commentary is not validated", async () => {
    const r = await runValidator(richScout(), [
      {
        claim_text: "they like attacking positions",
        claim_type: "opponent_plays_opening",
        expected_in_data: { opening_name: "phantom-opening", stated_pct: 99 },
        claim_class: "qualitative_commentary",
        confidence: 0.9,
      },
    ]);
    expect(r.passed).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("conditional_speculation is not validated", async () => {
    const r = await runValidator(richScout(), [
      {
        claim_text: "if they play X they'll score 90%",
        claim_type: "opponent_strength_opening",
        expected_in_data: { opening_name: "phantom-opening", stated_pct: 99 },
        claim_class: "conditional_speculation",
        confidence: 0.9,
      },
    ]);
    expect(r.passed).toBe(true);
  });

  it("low-confidence factual claim is skipped (default threshold 0.5)", async () => {
    const r = await runValidator(richScout(), [
      factualClaim("opponent_plays_opening", { opening_name: "Najdorf", stated_pct: 99 }, "claim", 0.3),
    ]);
    expect(r.passed).toBe(true);
    // Telemetry has a parser_low_confidence event but no issue.
    expect(r.telemetry.some((e) => e.fire_reason === "parser_low_confidence")).toBe(true);
  });

  it("confidence threshold is overridable", async () => {
    const r = await runValidator(
      richScout(),
      [factualClaim("opponent_plays_opening", { opening_name: "Najdorf", stated_pct: 99 }, "claim", 0.65)],
      undefined,
      { confidenceThreshold: 0.8 }
    );
    expect(r.passed).toBe(true);
    expect(r.telemetry.some((e) => e.fire_reason === "parser_low_confidence")).toBe(true);
  });

  it("malformed parser JSON returns passed=true + parser_json_invalid telemetry", async () => {
    const r = await validateScoutCitation({
      llmResponse: "anything",
      scout: richScout(),
      opponentUsername: "user",
      correlationId: "test",
      parseCall: malformedParser("not valid json {"),
    });
    expect(r.passed).toBe(true);
    expect(r.telemetry.some((e) => e.fire_reason === "parser_json_invalid")).toBe(true);
  });

  it("empty parser output returns passed=true", async () => {
    const r = await runValidator(richScout(), []);
    expect(r.passed).toBe(true);
    expect(r.telemetry).toHaveLength(0);
  });

  it("parser output wrapped in ```json``` fence is parsed correctly", async () => {
    const parseCall: ParserCall = async () => ({
      raw: "```json\n[]\n```",
      costUsd: 0,
    });
    const r = await validateScoutCitation({
      llmResponse: "x",
      scout: richScout(),
      opponentUsername: "user",
      correlationId: "test",
      parseCall,
    });
    expect(r.passed).toBe(true);
  });

  it("telemetry on unsupported claim carries claim_type for sweep aggregation (Aayan Stage C req)", async () => {
    const r = await runValidator(emptyScout(), [
      factualClaim("opponent_plays_opening", { opening_name: "Najdorf", stated_pct: 60 }),
    ]);
    const fire = r.telemetry.find((e) => e.fire_reason === "unsupported_citation");
    expect(fire).toBeDefined();
    expect((fire?.expected as { claim_type: string }).claim_type).toBe("opponent_plays_opening");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// countScoutOpportunities
// ──────────────────────────────────────────────────────────────────────────

describe("countScoutOpportunities", () => {
  it("empty scout yields zero opportunities", () => {
    const opps = countScoutOpportunities(emptyScout());
    expect(opps).toHaveLength(0);
  });

  it("rich scout yields opportunities across all groups", () => {
    const opps = countScoutOpportunities(richScout(), richCollisions());
    // At minimum: 4 opening entries × ~2 claim types each (plays + strength/weakness)
    //           + 1 archetype + multiple profile dimensions + ratings + phaseElo
    //           + tells total + 2 factors + 6 psychology rates above thresholds
    //           + 2 streak entries + avg_game_length
    //           + 2 rivals + 1 novelty + 2 checklist + 2 recent buckets
    //           + 2 collisions
    expect(opps.length).toBeGreaterThan(20);
  });

  it("threshold edge: timeoutRate exactly at threshold (5%) does NOT count", () => {
    const scout = emptyScout();
    scout.psychology.timeoutRate = 5;
    const opps = countScoutOpportunities(scout);
    expect(opps.some((o) => o.claim_type === "timeout_pattern")).toBe(false);
  });

  it("threshold edge: timeoutRate just above threshold (5.1%) counts", () => {
    const scout = emptyScout();
    scout.psychology.timeoutRate = 5.1;
    const opps = countScoutOpportunities(scout);
    expect(opps.some((o) => o.claim_type === "timeout_pattern")).toBe(true);
  });

  it("each opening entry contributes one plays + one strength-or-weakness opp", () => {
    const scout = emptyScout();
    scout.prep.asWhite.weaknesses = [
      { eco: "C", name: "Italian", variation: "", moves: [], totalGames: 10, scorePct: 30, wins: 0, draws: 0, losses: 0 },
    ];
    const opps = countScoutOpportunities(scout);
    expect(opps.filter((o) => o.claim_type === "opponent_plays_opening")).toHaveLength(1);
    expect(opps.filter((o) => o.claim_type === "opponent_weakness_opening")).toHaveLength(1);
    expect(opps.filter((o) => o.claim_type === "opponent_strength_opening")).toHaveLength(0);
  });

  it("non-default profile dimensions are notable; defaults at 50 are not", () => {
    const scout = emptyScout();
    scout.profile.atk = 78; // 28 above midpoint — notable
    scout.profile.def = 50; // exactly midpoint — not notable
    const opps = countScoutOpportunities(scout);
    const dimOpps = opps.filter((o) => o.claim_type === "profile_dimension");
    expect(dimOpps).toHaveLength(1);
  });

  it("tells factors with score > 0 each contribute one opp", () => {
    const scout = emptyScout();
    scout.tells.total = 60;
    scout.tells.factors = [
      { id: "tilts", label: "x", score: 80 },
      { id: "limited_rep", label: "y", score: 0 },
    ];
    const opps = countScoutOpportunities(scout);
    expect(opps.filter((o) => o.claim_type === "tells_total")).toHaveLength(1);
    expect(opps.filter((o) => o.claim_type === "tells_factor")).toHaveLength(1);
  });

  it("collisions contribute one opp per line", () => {
    const scout = emptyScout();
    const opps = countScoutOpportunities(scout, richCollisions());
    expect(opps.filter((o) => o.claim_type === "collision_edge")).toHaveLength(2);
  });

  it("streak claim is recorded for both win and loss streaks when each ≥ threshold", () => {
    const scout = emptyScout();
    scout.psychology.maxWinStreak = 8;
    scout.psychology.maxLossStreak = 4;
    const opps = countScoutOpportunities(scout);
    expect(opps.filter((o) => o.claim_type === "streak_claim")).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Public constant sanity
// ──────────────────────────────────────────────────────────────────────────

describe("scoutCitation: public constants", () => {
  it("SCOUT_TOLERANCE exports the expected fields", () => {
    expect(SCOUT_TOLERANCE.pct).toBe(5);
    expect(SCOUT_TOLERANCE.rating).toBe(25);
    expect(SCOUT_TOLERANCE.phaseDelta).toBe(50);
    expect(SCOUT_TOLERANCE.factorScore).toBe(10);
    expect(SCOUT_TOLERANCE.scoreOutOfHundred).toBe(5);
    expect(SCOUT_TOLERANCE.count).toBe(1);
    expect(SCOUT_TOLERANCE.plies).toBe(10);
  });
});
