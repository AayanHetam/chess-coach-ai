import { describe, expect, it } from "vitest";
import { buildEngineDataNotice } from "../engineDataNotice";

/**
 * T7's server half. The client can now state that no evaluation is ever
 * arriving; this is the block that puts that statement in front of the model.
 *
 * The point of the wording is the distinction the model would otherwise get
 * wrong on its own: "no engine data" is a fact about the TOOLING. Left to
 * infer, a coach with no evals available writes the reply it would write about
 * a clean game — which is a claim about the chess, and it is unfounded.
 */

describe("buildEngineDataNotice", () => {
  it("says nothing when evals are present (ordinary prompts stay byte-identical)", () => {
    expect(buildEngineDataNotice(false, true)).toBe("");
    expect(buildEngineDataNotice(undefined, true)).toBe("");
    expect(buildEngineDataNotice(false, false)).toBe("");
  });

  it("lets real engine data override a stale client claim", () => {
    // If evals arrived, they are the evidence; the flag is only a report about
    // the client's own state and may have been set before the sweep landed.
    expect(buildEngineDataNotice(true, true)).toBe("");
  });

  it("states the absence when no evals are coming", () => {
    const out = buildEngineDataNotice(true, false);
    expect(out).toContain("NO ENGINE ANALYSIS AVAILABLE");
    expect(out).toMatch(/could not run/i);
  });

  it("forbids exactly the claims that have no evidence behind them", () => {
    const out = buildEngineDataNotice(true, false);
    expect(out).toMatch(/centipawn/i);
    expect(out).toMatch(/accuracy/i);
    expect(out).toMatch(/blunder, mistake, or inaccuracy/i);
  });

  it("forbids the inverse claim too, which is the one a model volunteers", () => {
    // "No mistakes to report" is the answer a coach with no evals drifts into,
    // and it is a statement about the game that nothing supports.
    const out = buildEngineDataNotice(true, false);
    expect(out).toMatch(/well played|no serious errors/i);
  });

  it("does not turn into a refusal — the coach still has plenty to say", () => {
    const out = buildEngineDataNotice(true, false);
    expect(out).toMatch(/DO still help/);
    expect(out).toMatch(/openings/i);
  });
});
