import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  writeFlushPayload,
  readFlushPayload,
  clearFlushPayload,
  clearAllQuizStorage,
  hasFreshPendingFlush,
  FLUSH_FRESH_MS,
} from "../quizStorage";
import { DRAFT_STORAGE_KEY, FLUSH_STORAGE_KEY } from "../quizConfig";

// Minimal localStorage shim — the flush helpers read/write window.localStorage
// directly (not the useLocalStorage hook). The vitest env is "node", so there's
// no window by default.
const store = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    store.set(k, String(v));
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
};

beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: fakeLocalStorage,
  };
});

afterAll(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("quizStorage flush helpers", () => {
  it("round-trips a payload with a numeric createdAt", () => {
    writeFlushPayload({ selfReportedRating: 1300, focusThemes: ["fork"] });
    const env = readFlushPayload();
    expect(env).not.toBeNull();
    expect(env!.payload).toEqual({
      selfReportedRating: 1300,
      focusThemes: ["fork"],
    });
    expect(typeof env!.createdAt).toBe("number");
  });

  it("returns null when nothing is stored", () => {
    expect(readFlushPayload()).toBeNull();
  });

  it("treats corrupt JSON as empty and clears the key", () => {
    store.set(FLUSH_STORAGE_KEY, "{not valid json");
    expect(readFlushPayload()).toBeNull();
    expect(store.has(FLUSH_STORAGE_KEY)).toBe(false);
  });

  it("treats an empty payload object as nothing and clears the key", () => {
    store.set(
      FLUSH_STORAGE_KEY,
      JSON.stringify({ payload: {}, createdAt: Date.now() })
    );
    expect(readFlushPayload()).toBeNull();
    expect(store.has(FLUSH_STORAGE_KEY)).toBe(false);
  });

  it("clearFlushPayload removes only the flush key", () => {
    store.set(
      FLUSH_STORAGE_KEY,
      JSON.stringify({
        payload: { selfReportedRating: 1 },
        createdAt: Date.now(),
      })
    );
    store.set(DRAFT_STORAGE_KEY, "draft");
    clearFlushPayload();
    expect(store.has(FLUSH_STORAGE_KEY)).toBe(false);
    expect(store.has(DRAFT_STORAGE_KEY)).toBe(true);
  });

  it("clearAllQuizStorage removes both keys", () => {
    store.set(
      FLUSH_STORAGE_KEY,
      JSON.stringify({
        payload: { selfReportedRating: 1 },
        createdAt: Date.now(),
      })
    );
    store.set(DRAFT_STORAGE_KEY, "draft");
    clearAllQuizStorage();
    expect(store.has(FLUSH_STORAGE_KEY)).toBe(false);
    expect(store.has(DRAFT_STORAGE_KEY)).toBe(false);
  });
});

describe("hasFreshPendingFlush", () => {
  it("is true right after a write", () => {
    writeFlushPayload({ selfReportedRating: 1300 });
    expect(hasFreshPendingFlush()).toBe(true);
  });

  it("is false for a stale payload (older than the freshness window)", () => {
    const stale = {
      payload: { selfReportedRating: 1300 },
      createdAt: Date.now() - FLUSH_FRESH_MS - 1000,
    };
    store.set(FLUSH_STORAGE_KEY, JSON.stringify(stale));
    expect(hasFreshPendingFlush()).toBe(false);
  });

  it("is false when there's nothing pending", () => {
    expect(hasFreshPendingFlush()).toBe(false);
  });
});
