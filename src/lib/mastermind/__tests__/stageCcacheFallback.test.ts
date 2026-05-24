import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  tryReadStageCUserHistoryCache,
  STAGE_C_CACHED_USERNAMES,
} from "@/lib/mastermind/stageCcacheFallback";

describe("tryReadStageCUserHistoryCache", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Gate 1 — VERCEL_ENV must be 'preview'", () => {
    it("returns null when VERCEL_ENV='production' (cached user)", () => {
      vi.stubEnv("VERCEL_ENV", "production");
      expect(tryReadStageCUserHistoryCache("Lazer_Wizard")).toBeNull();
    });

    it("returns null when VERCEL_ENV='development'", () => {
      vi.stubEnv("VERCEL_ENV", "development");
      expect(tryReadStageCUserHistoryCache("Lazer_Wizard")).toBeNull();
    });

    it("returns null when VERCEL_ENV is unset (empty string)", () => {
      vi.stubEnv("VERCEL_ENV", "");
      expect(tryReadStageCUserHistoryCache("Lazer_Wizard")).toBeNull();
    });
  });

  describe("Gate 2 — username must match a cached test user", () => {
    beforeEach(() => {
      vi.stubEnv("VERCEL_ENV", "preview");
    });

    it("returns null for a non-cached username", () => {
      expect(tryReadStageCUserHistoryCache("RandomChessPlayer")).toBeNull();
    });

    it("returns null for empty username", () => {
      expect(tryReadStageCUserHistoryCache("")).toBeNull();
    });
  });

  describe("Happy path — both gates pass", () => {
    beforeEach(() => {
      vi.stubEnv("VERCEL_ENV", "preview");
    });

    it.each(STAGE_C_CACHED_USERNAMES)(
      "returns the cached games for %s",
      (username) => {
        const games = tryReadStageCUserHistoryCache(username);
        expect(games).not.toBeNull();
        expect(Array.isArray(games)).toBe(true);
        // Each cache file has 200 games per the loader script's default.
        expect(games!.length).toBe(200);
      },
    );

    it("case-insensitive match: lowercase username resolves the same cache", () => {
      const lower = tryReadStageCUserHistoryCache("lazer_wizard");
      const exact = tryReadStageCUserHistoryCache("Lazer_Wizard");
      expect(lower).not.toBeNull();
      expect(lower).toBe(exact); // Same object reference — cache lookup is by lowercase key
    });

    it("game shape matches UserHistoryGame contract (pgn + white.name + black.name)", () => {
      const games = tryReadStageCUserHistoryCache("gothamchess");
      expect(games).not.toBeNull();
      const g = games![0];
      expect(typeof g.pgn).toBe("string");
      expect(g.pgn.length).toBeGreaterThan(0);
      expect(typeof g.white.name).toBe("string");
      expect(typeof g.black.name).toBe("string");
    });
  });
});
