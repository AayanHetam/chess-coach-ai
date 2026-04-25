import { describe, expect, it } from "vitest";
import { envSchema, parseEnv } from "../env";

// P1-17 regression: server boot must fail fast on missing required vars
// rather than booting cleanly and 500ing on the first AI request.
// See src/instrumentation.ts for the import site.

describe("env validator", () => {
  it("accepts a populated ANTHROPIC_API_KEY", () => {
    const result = envSchema.safeParse({ ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing ANTHROPIC_API_KEY", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string ANTHROPIC_API_KEY", () => {
    const result = envSchema.safeParse({ ANTHROPIC_API_KEY: "" });
    expect(result.success).toBe(false);
  });

  it("parseEnv throws with a readable message listing offending keys", () => {
    expect(() => parseEnv({})).toThrow(/ANTHROPIC_API_KEY/);
  });
});
