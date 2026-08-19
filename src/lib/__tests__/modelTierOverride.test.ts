import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Model-tier overrides (`LLM_FLAGSHIP_MODEL` / `LLM_FAST_MODEL`).
 *
 * The point of the flag is that a model upgrade is a config change with a
 * one-line revert. Two properties have to hold for that to be safe:
 *
 *   1. UNSET means today's mapping, byte for byte. A flag that quietly
 *      changes behaviour when nobody set it is not a flag.
 *   2. A typo must not take the coach down, and must not be silent either.
 *      It falls back to the default and logs an error; the model that
 *      actually ran is on every LLMResult, so telemetry shows the truth
 *      rather than the intent.
 *
 * `effort` is keyed on the MODEL, not the tier. Haiku 4.5 returns 400 if sent
 * one; Sonnet 4.6 and Opus 5 both accept it (probed live 2026-08-19). Gating
 * on the tier — as this did — is correct only while the mapping never moves,
 * which is exactly what this flag exists to change.
 */

const ORIGINAL = { ...process.env };

async function loadProvider() {
  vi.resetModules();
  return import("@/lib/llmProvider");
}

beforeEach(() => {
  delete process.env.LLM_FLAGSHIP_MODEL;
  delete process.env.LLM_FAST_MODEL;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("__resolveAnthropicModelForTest", () => {
  it("unset ⇒ exactly today's mapping", async () => {
    const { __resolveAnthropicModelForTest: r } = await loadProvider();
    expect(r("flagship").id).toBe("claude-sonnet-4-6");
    expect(r("fast").id).toBe("claude-haiku-4-5-20251001");
  });

  it("applies the upgrade this flag exists for", async () => {
    process.env.LLM_FLAGSHIP_MODEL = "claude-opus-5";
    process.env.LLM_FAST_MODEL = "claude-sonnet-4-6";
    const { __resolveAnthropicModelForTest: r } = await loadProvider();
    expect(r("flagship").id).toBe("claude-opus-5");
    expect(r("fast").id).toBe("claude-sonnet-4-6");
  });

  it("carries per-model effort support, so the tier can move safely", async () => {
    const { __resolveAnthropicModelForTest: r } = await loadProvider();
    // Haiku 400s on `effort`; the other two accept it. Keyed on the model so
    // this stays true wherever each is mapped.
    expect(r("fast").supportsEffort).toBe(false);
    expect(r("flagship").supportsEffort).toBe(true);

    process.env.LLM_FAST_MODEL = "claude-sonnet-4-6";
    const { __resolveAnthropicModelForTest: r2 } = await loadProvider();
    expect(r2("fast").supportsEffort).toBe(true);
  });

  it("a typo falls back rather than taking the coach down", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LLM_FLAGSHIP_MODEL = "claude-opus-5-typo";
    const { __resolveAnthropicModelForTest: r } = await loadProvider();
    expect(r("flagship").id).toBe("claude-sonnet-4-6");
    expect(err).toHaveBeenCalled();
  });

  it("ignores whitespace-only values", async () => {
    process.env.LLM_FLAGSHIP_MODEL = "   ";
    const { __resolveAnthropicModelForTest: r } = await loadProvider();
    expect(r("flagship").id).toBe("claude-sonnet-4-6");
  });

  it("every reachable model has a price, or the cost dashboard lies", async () => {
    const { __ANTHROPIC_MODEL_SPECS_FOR_TEST: specs } = await loadProvider();
    const { MODEL_PRICING } = await import("@/lib/llmPricing");
    for (const id of Object.keys(specs)) {
      expect(MODEL_PRICING[id], `no pricing row for ${id}`).toBeDefined();
    }
  });
});
