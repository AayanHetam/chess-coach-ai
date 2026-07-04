import { describe, it, expect } from "vitest";
import { fallbackReason } from "../runHelpfulnessBaseline";

describe("fallbackReason — keep robotic non-coaching out of the teaching score", () => {
  it("flags the deterministic validator fallback template", () => {
    const t =
      "White holds a significant advantage.\n\nWhat to look at:\n- Black's king on e8 lost its role as attacker, defender, overworked.";
    expect(fallbackReason(t)).toBe("validator_fallback");
  });

  it("flags 'became <role>' fallback phrasing", () => {
    expect(fallbackReason("The position is balanced.\n\nWhat to look at:\n- Black's bishop on c8 became bad-bishop.")).toBe(
      "validator_fallback",
    );
  });

  it("flags the timeout stub", () => {
    expect(fallbackReason("Still analyzing — the deep-validation pass took longer than expected. Please ask again.")).toBe(
      "timeout_stub",
    );
  });

  it("flags too-short responses as timeout stubs", () => {
    expect(fallbackReason("ok")).toBe("timeout_stub");
  });

  it("returns null for genuine LLM coaching (even when it mentions roles/squares)", () => {
    const real =
      "You've entered the Italian Game — your bishop on c4 eyes f7, Black's weakest pawn (only defended by the king). Castle kingside soon and consider d3 to keep the center solid.";
    expect(fallbackReason(real)).toBeNull();
  });
});
