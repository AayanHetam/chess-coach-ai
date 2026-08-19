import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AI_DISABLED_ERROR,
  aiDisabledResponse,
  isAiDisabled,
  isAiDisabledPublic,
} from "../aiAvailability";

/**
 * The deliberate pause on AI features.
 *
 * When the Anthropic balance ran out, the product did not stop working — it
 * started lying. `/api/puzzle-hint` returned "AI coaching is temporarily
 * unavailable. Please try again", which reads like a blip worth retrying, when
 * the real state was "this will not work until a bill is paid".
 *
 * So the two states must be distinguishable by the client, and the switch must
 * default to OFF — a kill switch that trips on an unset variable would take
 * the product down the moment somebody forgets to set it.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.AI_COACH_DISABLED;
  delete process.env.NEXT_PUBLIC_AI_COACH_DISABLED;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("isAiDisabled — off unless explicitly switched on", () => {
  it("unset ⇒ AI enabled", () => {
    expect(isAiDisabled()).toBe(false);
  });

  it('only the exact string "true" disables', () => {
    // A kill switch that trips on "false", "0" or a typo is a liability.
    for (const v of ["false", "0", "no", "TRUE", "True", "1", ""]) {
      process.env.AI_COACH_DISABLED = v;
      expect(isAiDisabled(), `"${v}" should not disable`).toBe(false);
    }
    process.env.AI_COACH_DISABLED = "true";
    expect(isAiDisabled()).toBe(true);
  });

  it("the client mirror is a SEPARATE variable", () => {
    // NEXT_PUBLIC_* is inlined at build time; the server flag is read at
    // runtime. Neither can stand in for the other, and only the server one
    // actually enforces.
    process.env.AI_COACH_DISABLED = "true";
    expect(isAiDisabledPublic()).toBe(false);

    process.env.NEXT_PUBLIC_AI_COACH_DISABLED = "true";
    expect(isAiDisabledPublic()).toBe(true);
  });
});

describe("aiDisabledResponse", () => {
  it("is 503 with Retry-After — the service exists and is coming back", () => {
    const res = aiDisabledResponse();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("carries a code distinct from the generic provider failure", async () => {
    // AI_PROVIDER_UNAVAILABLE means "broke, retry may help".
    // AI_TEMPORARILY_DISABLED means "off on purpose, retry will not help".
    // A client that cannot tell them apart shows a spinner for neither.
    const body = await aiDisabledResponse().json();
    expect(body.code).toBe("AI_TEMPORARILY_DISABLED");
    expect(body.code).not.toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("tells the user what still works, not just what does not", async () => {
    // The chess product is untouched — board, engine analysis and puzzles all
    // run client-side. Saying only "AI is off" implies the whole app is dead.
    const body = await aiDisabledResponse().json();
    expect(body.error).toMatch(/engine analysis|puzzles/i);
    expect(AI_DISABLED_ERROR.message).toMatch(/still work/i);
  });
});
