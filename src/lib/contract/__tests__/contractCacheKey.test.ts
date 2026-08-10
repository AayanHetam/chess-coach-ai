/**
 * PR-CI-4 cache split gate (plan risk #6): the c4.0| marker on every key the
 * contract path touches, legacy 3.6 keys untouched — enforced BOTH
 * behaviorally and by a source scan of every generateCacheKey call site
 * (the plan's "unit test on EVERY generateCacheKey call site").
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  CONTRACT_CACHE_PREFIX,
  generateCacheKey,
  generateContractCacheKey,
  getCachedResponse,
  setCachedResponse,
  clearCache,
} from "@/lib/responseCache";
import { PROMPT_VERSION } from "@/lib/prompts/coachChatPrompt";
import { VERBALIZER_PROMPT_VERSION } from "@/lib/prompts/verbalizerPrompt";

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("cache key topology", () => {
  it("legacy keys carry v3.6 and NO contract marker", () => {
    expect(PROMPT_VERSION).toBe("3.6");
    const key = generateCacheKey(FEN, "intermediate", "analyze my game", "p", ["e4"]);
    expect(key.startsWith(`v${PROMPT_VERSION}|`)).toBe(true);
    expect(key.includes(CONTRACT_CACHE_PREFIX)).toBe(false);
  });

  it("contract keys are the legacy key with the c4.0| marker prepended", () => {
    expect(VERBALIZER_PROMPT_VERSION).toBe("4.0");
    expect(CONTRACT_CACHE_PREFIX).toBe("c4.0|");
    const legacy = generateCacheKey(FEN, "intermediate", "analyze my game", "p", ["e4"]);
    const contractKey = generateContractCacheKey(FEN, "intermediate", "analyze my game", "p", ["e4"]);
    expect(contractKey).toBe(`${CONTRACT_CACHE_PREFIX}${legacy}`);
  });

  it("dual-mode entries never cross-serve (write one, miss the other)", () => {
    clearCache();
    const legacy = generateCacheKey(FEN, "intermediate", "q", "p", []);
    const contractKey = generateContractCacheKey(FEN, "intermediate", "q", "p", []);
    setCachedResponse(legacy, "LEGACY RESPONSE", 1.0);
    expect(getCachedResponse(contractKey)).toBeNull();
    expect(getCachedResponse(legacy)).toBe("LEGACY RESPONSE");
    setCachedResponse(contractKey, "CONTRACT RESPONSE", 1.0);
    expect(getCachedResponse(contractKey)).toBe("CONTRACT RESPONSE");
    expect(getCachedResponse(legacy)).toBe("LEGACY RESPONSE");
    clearCache();
  });
});

describe("source scan — every generateCacheKey call site (plan gate)", () => {
  const SRC = path.join(process.cwd(), "src");

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        out.push(...walk(p));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(p);
      }
    }
    return out;
  }

  it("the ONLY generateCacheKey( call sites are the legacy route site and the responseCache definitions", () => {
    const callers: Array<{ file: string; line: number }> = [];
    for (const file of walk(SRC)) {
      const text = fs.readFileSync(file, "utf8");
      const lines = text.split("\n");
      lines.forEach((l, i) => {
        // Call sites only (not imports/exports/type refs).
        if (/(?<![A-Za-z0-9_])generateCacheKey\(/.test(l) && !/generateContractCacheKey\(/.test(l)) {
          callers.push({ file: path.relative(SRC, file), line: i + 1 });
        }
      });
    }
    const files = callers.map((c) => c.file).sort();
    // responseCache.ts: the function definition + the wrapper's delegation.
    // route.ts: the single LEGACY cache-key site (contract path uses the
    // wrapper). ANY new call site must be reviewed for the c4.0| marker and
    // added here deliberately.
    expect(files).toEqual([
      "app/api/enhanced-analysis/route.ts",
      "lib/responseCache.ts",
      "lib/responseCache.ts",
    ]);
  });

  it("the contract serving module never touches unprefixed keys", () => {
    const text = fs.readFileSync(
      path.join(SRC, "lib/contract/contractServing.ts"),
      "utf8",
    );
    expect(/(?<!Contract)generateCacheKey\(/.test(text)).toBe(false);
    expect(text).toContain("generateContractCacheKey(");
  });
});
