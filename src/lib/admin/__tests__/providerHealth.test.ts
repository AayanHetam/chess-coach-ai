import { describe, expect, it } from "vitest";
import { parseProviderHealthResult } from "../providerHealth";

describe("parseProviderHealthResult", () => {
  it("parses the sanitized nested provider response", () => {
    expect(
      parseProviderHealthResult({
        ok: true,
        providers: { anthropic: { ok: true }, openai: { ok: false } },
      })
    ).toEqual({
      ok: true,
      providers: { anthropic: { ok: true }, openai: { ok: false } },
    });
  });

  it.each([
    null,
    {},
    { ok: true },
    { ok: true, providers: {} },
    {
      ok: true,
      providers: { anthropic: { ok: "yes" }, openai: { ok: false } },
    },
  ])("rejects malformed results without exposing arbitrary fields", (value) => {
    expect(parseProviderHealthResult(value)).toBeNull();
  });

  it("drops unexpected provider content", () => {
    expect(
      parseProviderHealthResult({
        ok: false,
        providers: {
          anthropic: { ok: false, error: "sensitive provider body" },
          openai: { ok: false, account: "sensitive account" },
        },
      })
    ).toEqual({
      ok: false,
      providers: { anthropic: { ok: false }, openai: { ok: false } },
    });
  });
});
