import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import {
  fetchDataSources,
  resolveOpponent,
  type FetchOpts,
} from "@/lib/mastermind/wireValidators";
import { __resetScoutCacheForTesting } from "@/lib/server/scoutFetch";

// ─────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminFirestore: vi.fn(),
  AdminConfigError: class AdminConfigError extends Error {},
  __resetAdminCacheForTests: vi.fn(),
}));

import { getAdminFirestore } from "@/lib/server/firebaseAdmin";

// Real-but-controllable mock of pieceRoles. By default, passthrough to the
// real implementation so the happy-path test sees genuine RoleChange output.
// Individual tests can override classifyPieceRoles to throw via vi.spyOn.
vi.mock("@/lib/mastermind/pieceRoles", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/mastermind/pieceRoles")>();
  return {
    ...original,
    classifyPieceRoles: vi.fn(original.classifyPieceRoles),
    diffPieceRoles: vi.fn(original.diffPieceRoles),
  };
});

import { classifyPieceRoles } from "@/lib/mastermind/pieceRoles";

// ─────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

function baseOpts(overrides: Partial<FetchOpts> = {}): FetchOpts {
  return {
    fenBefore: STARTING_FEN,
    fenAfter: AFTER_E4_FEN,
    playerPerspective: "white",
    correlationId: "test-correlation-id",
    uid: "test-uid",
    userName: "TestUser",
    ...overrides,
  };
}

function lichessNdjson(extra?: Partial<Record<string, unknown>>): string {
  return JSON.stringify({
    id: "lichess-game-1",
    winner: "white",
    moves: "e4 e5 Nf3 Nc6",
    players: {
      white: { user: { name: "OpponentX" }, rating: 1700 },
      black: { user: { name: "TestUser" }, rating: 1750 },
    },
    speed: "blitz",
    status: "mate",
    lastMoveAt: 1700000000000,
    ...extra,
  });
}

function mockLichessFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    text: async () => lichessNdjson(),
  } as Response);
}

function mockFirestoreGames(games: Array<Record<string, unknown>>) {
  // Mimic the firebase-admin Firestore chain: db.collection().doc().collection().orderBy().limit().get()
  const get = vi.fn().mockResolvedValue({
    docs: games.map((g, i) => ({
      id: `doc-${i}`,
      data: () => g,
    })),
  });
  const chain: any = {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get,
  };
  vi.mocked(getAdminFirestore).mockResolvedValue(chain);
  return { chain, get };
}

beforeEach(() => {
  __resetScoutCacheForTesting();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────

describe("fetchDataSources: happy path", () => {
  it("resolves all four sources when each succeeds", async () => {
    vi.stubGlobal("fetch", mockLichessFetch());
    mockFirestoreGames([
      { pgn: "1. e4 e5", white: { name: "TestUser" }, black: { name: "OpponentX" }, result: "1-0", timeControl: "180+2" },
      { pgn: "1. d4 d5", white: { name: "TestUser" }, black: { name: "OpponentY" }, result: "0-1", timeControl: "180+2" },
    ]);

    const result = await fetchDataSources(
      baseOpts({ opponentUsername: "OpponentX", opponentPlatform: "lichess" }),
    );

    expect(result.featureDelta).toBeDefined();
    expect(result.pieceRoleDiff).toBeInstanceOf(Array);
    expect(result.scout?.opponentUsername).toBe("OpponentX");
    expect(result.scout?.scout).toBeDefined();
    expect(result.userHistory?.games).toHaveLength(2);
    expect(result.userHistory?.userName).toBe("TestUser");
  });

  it("scout omitted when no opponent identity resolves", async () => {
    vi.stubGlobal("fetch", mockLichessFetch());
    mockFirestoreGames([]);

    const result = await fetchDataSources(baseOpts());

    expect(result.scout).toBeUndefined();
    // featureDelta + roleDiff still produced; userHistory present but empty.
    expect(result.featureDelta).toBeDefined();
    expect(result.userHistory?.games).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Failure matrix (§3.2)
// ─────────────────────────────────────────────────────────────────────

describe("fetchDataSources: failure matrix", () => {
  it("featureDelta failure (invalid FEN) propagates — route falls back to flag-off", async () => {
    mockFirestoreGames([]);

    await expect(
      fetchDataSources(
        baseOpts({ fenBefore: "this-is-not-a-fen", fenAfter: AFTER_E4_FEN }),
      ),
    ).rejects.toThrow();
  });

  it("pieceRoleDiff failure returns empty array; pipeline runs without role checks", async () => {
    vi.mocked(classifyPieceRoles).mockImplementationOnce(() => {
      throw new Error("simulated pieceRoles failure");
    });
    mockFirestoreGames([]);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchDataSources(baseOpts());

    expect(result.pieceRoleDiff).toEqual([]);
    expect(result.featureDelta).toBeDefined(); // FD still succeeds
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("source=pieceRoleDiff"),
    );
  });

  it("scout fetch failure → scout undefined; pipeline skips scout validator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false } as Response),
    );
    mockFirestoreGames([]);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchDataSources(
      baseOpts({
        opponentUsername: "DoesNotExist",
        opponentPlatform: "lichess",
      }),
    );

    expect(result.scout).toBeUndefined();
    expect(result.featureDelta).toBeDefined(); // Independent
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("source=scout"),
    );
  });

  it("userHistory fetch failure → userHistory undefined; pipeline skips user-history validator", async () => {
    vi.mocked(getAdminFirestore).mockRejectedValue(
      new Error("firestore offline"),
    );

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchDataSources(baseOpts());

    expect(result.userHistory).toBeUndefined();
    expect(result.featureDelta).toBeDefined(); // Independent
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("source=userHistory"),
    );
  });

  it("all four sources failing independently — featureDelta success required", async () => {
    // FD succeeds (valid FENs); role-diff throws; scout fetch fails; UH fails.
    vi.mocked(classifyPieceRoles).mockImplementationOnce(() => {
      throw new Error("role fail");
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net")));
    vi.mocked(getAdminFirestore).mockRejectedValue(new Error("fs"));

    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchDataSources(
      baseOpts({
        opponentUsername: "X",
        opponentPlatform: "chess.com",
      }),
    );

    expect(result.featureDelta).toBeDefined();
    expect(result.pieceRoleDiff).toEqual([]);
    expect(result.scout).toBeUndefined();
    expect(result.userHistory).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Per-source timeout (§3.3)
// ─────────────────────────────────────────────────────────────────────

describe("fetchDataSources: per-source timeout", () => {
  it("scout fetch exceeding timeout → scout undefined, others succeed", async () => {
    // Fetch that never resolves — should trigger the timeout.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    mockFirestoreGames([]);

    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchDataSources(
      baseOpts({
        opponentUsername: "Slow",
        opponentPlatform: "lichess",
        perSourceTimeoutMs: 50,
      }),
    );

    expect(result.scout).toBeUndefined();
    expect(result.featureDelta).toBeDefined();
    expect(result.userHistory?.games).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// T11 opponent resolution (Option (c))
// ─────────────────────────────────────────────────────────────────────

describe("resolveOpponent: T11 Option (c) chain", () => {
  it("PGN parse with user as White → opponent is Black", () => {
    const pgn = `[White "TestUser"]\n[Black "OpponentName"]\n\n1. e4 e5`;
    const opp = resolveOpponent(baseOpts({ pgn, userName: "TestUser" }));
    expect(opp).toBe("OpponentName");
  });

  it("PGN parse with user as Black → opponent is White", () => {
    const pgn = `[White "OpponentName"]\n[Black "TestUser"]\n\n1. e4 e5`;
    const opp = resolveOpponent(baseOpts({ pgn, userName: "TestUser" }));
    expect(opp).toBe("OpponentName");
  });

  it("PGN parse with substring match (Stage A.7 detectUserColor pattern)", () => {
    const pgn = `[White "TestUser_Lichess"]\n[Black "TheirHandle"]\n\n1. d4 d5`;
    const opp = resolveOpponent(baseOpts({ pgn, userName: "TestUser" }));
    expect(opp).toBe("TheirHandle");
  });

  it("PGN missing user-matching header → falls back to opts.opponentUsername", () => {
    const pgn = `[White "PlayerA"]\n[Black "PlayerB"]\n\n1. e4`;
    const opp = resolveOpponent(
      baseOpts({
        pgn,
        userName: "TestUser",
        opponentUsername: "ExplicitOpp",
      }),
    );
    expect(opp).toBe("ExplicitOpp");
  });

  it("no PGN + explicit opponentUsername → uses explicit", () => {
    const opp = resolveOpponent(
      baseOpts({ opponentUsername: "OnlyExplicit" }),
    );
    expect(opp).toBe("OnlyExplicit");
  });

  it("no PGN + no explicit field → undefined (Scout fetch skipped)", () => {
    const opp = resolveOpponent(baseOpts());
    expect(opp).toBeUndefined();
  });

  it("PGN with no White/Black headers → falls back to explicit field", () => {
    const pgn = `[Event "Test"]\n\n1. e4`;
    const opp = resolveOpponent(
      baseOpts({ pgn, opponentUsername: "Fallback" }),
    );
    expect(opp).toBe("Fallback");
  });

  it("empty/whitespace explicit opponentUsername treated as absent", () => {
    const opp = resolveOpponent(baseOpts({ opponentUsername: "   " }));
    expect(opp).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Cache sharing (T14 / Option β)
// ─────────────────────────────────────────────────────────────────────

describe("fetchDataSources: shared scout cache", () => {
  it("two consecutive fetches for same opponent share the scoutFetch cache", async () => {
    const fetchSpy = mockLichessFetch();
    vi.stubGlobal("fetch", fetchSpy);
    mockFirestoreGames([]);

    const opts = baseOpts({
      opponentUsername: "CachedOpp",
      opponentPlatform: "lichess",
    });

    await fetchDataSources(opts);
    await fetchDataSources(opts);

    // First call fetched; second hit cache → only one fetch.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
