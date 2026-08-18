import { describe, expect, it } from "vitest";
import {
  buildCondensedContext,
  type AnalysisContext,
} from "@/lib/analysisContextCache";

/**
 * E1 (SILENT_SUBSTITUTION_HANDOFF §3 Group E) — the follow-up context dropped
 * the opening name, ECO, and accuracy.
 *
 * Meanwhile the cached system prompt still instructs the model to acknowledge
 * the opening BY NAME. So "what opening did I play?" was answered from memory
 * over raw SAN, and transposition-heavy lines got misnamed confidently — the
 * model was asked for a fact it had not been given.
 *
 * These are derived on read from data the context already holds, so no
 * storeAnalysisContext call site changes and entries written before this
 * existed still get an overview.
 */

function ctx(over: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    contextId: "c1",
    gameContext: "",
    compactGameContext: "",
    playedMoves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    systemPrompt: "",
    fewShotExamples: "",
    initialAnalysis: "analysis",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    playerColor: "w",
    skillLevel: "intermediate",
    moveCount: 3,
    createdAt: Date.now(),
    ...over,
  } as AnalysisContext;
}

describe("E1 — the follow-up context names the opening it was told to name", () => {
  it("includes the opening name", () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bb5 — the Ruy Lopez / Spanish.
    const out = buildCondensedContext(ctx());
    expect(out).toContain("## GAME OVERVIEW");
    expect(out).toMatch(/Opening: .+/);
  });

  it("reports the player's accuracy, taken from their own colour", () => {
    const out = buildCondensedContext(
      ctx({
        playerColor: "b",
        gameEval: { accuracy: { white: 91.2, black: 74.6 } } as never,
      }),
    );
    expect(out).toContain("74.6%");
    expect(out).not.toContain("91.2%");
  });

  it("reports estimated Elo for the player's colour", () => {
    const out = buildCondensedContext(
      ctx({ gameEval: { estimatedElo: { white: 1432.7, black: 1100 } } as never }),
    );
    expect(out).toContain("Estimated Elo for this game: 1433");
  });

  it("omits a line entirely rather than guessing when the value is absent", () => {
    // The whole point of the document this comes from: absence is stated by
    // saying nothing, never by inventing a plausible number.
    const out = buildCondensedContext(ctx({ gameEval: undefined }));
    expect(out).not.toContain("accuracy");
    expect(out).not.toContain("Estimated Elo");
  });

  it("emits no overview section at all when nothing is derivable", () => {
    const out = buildCondensedContext(
      ctx({ playedMoves: [], gameEval: undefined }),
    );
    expect(out).not.toContain("## GAME OVERVIEW");
  });

  it("survives junk in the eval payload (gameEval is z.any() at the boundary)", () => {
    expect(() =>
      buildCondensedContext(
        ctx({ gameEval: { accuracy: { white: NaN }, estimatedElo: null } as never }),
      ),
    ).not.toThrow();
    const out = buildCondensedContext(
      ctx({ gameEval: { accuracy: { white: NaN } } as never }),
    );
    expect(out).not.toContain("NaN");
  });

  it("survives an unreplayable move list without losing the rest of the context", () => {
    const out = buildCondensedContext(ctx({ playedMoves: ["Qxh7#", "e5"] }));
    expect(out).toContain("## ANALYSIS CONTEXT");
    expect(out).toContain("## GROUNDING RULES");
  });

  it("keeps the sections the follow-up path already depended on", () => {
    const out = buildCondensedContext(ctx());
    expect(out).toContain("## ANALYSIS CONTEXT");
    expect(out).toContain("## GROUNDING RULES");
    expect(out).toContain("## PRIOR DEEP ANALYSIS");
  });
});
