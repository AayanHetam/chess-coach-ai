import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ANALYSIS_HANDOFF_KEY,
  analysisHref,
  consumeStagedGame,
  stageGameForAnalysis,
} from "@/lib/analysis/handoff";

const PGN = '[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';

/**
 * The vitest environment is "node", so there is no `window`. Rather than pull
 * in jsdom for one module, install a minimal fake — which also makes the
 * storage-throws cases trivial to express.
 */
function installWindow(storage: {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
}) {
  (globalThis as { window?: unknown }).window = { sessionStorage: storage };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => {
  installWindow(memoryStorage());
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("stage / consume round trip", () => {
  it("returns exactly what was staged", () => {
    expect(stageGameForAnalysis(PGN)).toBe(true);
    expect(consumeStagedGame()).toBe(PGN);
  });

  it("clears on read so a refresh does not re-load the game", () => {
    // Without this, refreshing /analysis after navigating elsewhere reloads a
    // game the user has already moved on from.
    stageGameForAnalysis(PGN);
    expect(consumeStagedGame()).toBe(PGN);
    expect(consumeStagedGame()).toBeNull();
  });

  it("returns null when nothing was staged", () => {
    expect(consumeStagedGame()).toBeNull();
  });

  it("refuses to stage an empty or blank PGN", () => {
    expect(stageGameForAnalysis("")).toBe(false);
    expect(stageGameForAnalysis("   \n ")).toBe(false);
    expect(consumeStagedGame()).toBeNull();
  });

  it("treats a whitespace-only stored value as nothing", () => {
    const storage = memoryStorage();
    storage.map.set(ANALYSIS_HANDOFF_KEY, "   ");
    installWindow(storage);
    expect(consumeStagedGame()).toBeNull();
  });
});

describe("server-side rendering", () => {
  it("no-ops without a window instead of throwing", () => {
    // /profile renders on the server first; a ReferenceError here would blank
    // the whole page.
    delete (globalThis as { window?: unknown }).window;
    expect(stageGameForAnalysis(PGN)).toBe(false);
    expect(consumeStagedGame()).toBeNull();
  });
});

describe("storage failures fall back instead of breaking", () => {
  it("reports failure when sessionStorage throws on write", () => {
    // Safari private mode and hardened browser settings both do this. The
    // caller needs a real false so it can use the ?pgn= URL instead of
    // navigating to a page that will find nothing.
    installWindow({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    });
    expect(stageGameForAnalysis(PGN)).toBe(false);
  });

  it("returns null rather than throwing when reads fail", () => {
    installWindow({
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(consumeStagedGame()).toBeNull();
  });
});

describe("analysisHref", () => {
  it("uses the short flag URL when staging worked", () => {
    expect(analysisHref(PGN, true)).toBe("/analysis?handoff=1");
  });

  it("falls back to an inline pgn param when staging failed", () => {
    const href = analysisHref(PGN, false);
    expect(href.startsWith("/analysis?pgn=")).toBe(true);
    // Round-trips — a raw PGN in a query string would break on the # in "Qxf7#".
    const encoded = href.slice("/analysis?pgn=".length);
    expect(decodeURIComponent(encoded)).toBe(PGN);
  });

  it("keeps the staged URL far shorter than the inline one", () => {
    // The entire reason this module exists.
    expect(analysisHref(PGN, true).length).toBeLessThan(
      analysisHref(PGN, false).length
    );
  });
});
