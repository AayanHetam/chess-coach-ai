/**
 * The mechanical FP adjudicator's TRAPPED-CLASS rule.
 *
 * The adjudicator only ever proves a fire FALSE, so an unsound license there
 * silently inflates the measured false-intervention rate — the CI-5 gate. Its
 * `tactical_keyword_unbacked` rule was contract-GLOBAL and board-blind: any
 * fire whose keyword appeared in ANY insight's allowedTacticalKeywords was
 * declared a false positive.
 *
 * That is sound for relational vocabulary ("you forked them earlier" is fair
 * prose on a card that contains no fork) and unsound for the trapped class,
 * whose truth condition is arithmetic about one named piece on one board.
 * Both CI-5 gate runs failed on exactly this: 3 fires of 12 in the cap-5 run
 * were "trapped" on insight 05/M1, called false because insight M2's keyword
 * list contains the word — while chess.js gives every piece the sentence
 * names both legal moves and a safe square.
 *
 * Spans below are verbatim from
 * scripts/eval/results/contract-ci5-gates-cap5-2026-08-11.json.
 */
import { describe, expect, it } from "vitest";
import { adjudicateFp } from "../fpAdjudication";
import type { FpContractPools } from "../fpAdjudication";
import { isPvWindow, stripSanDecorations } from "@/lib/contract/refereeChecks";

const helpers = { stripSanDecorations, isPvWindow };

/** A pool that DOES contain "trapped" — the contract-global license. */
const pools = (): FpContractPools => ({
  san: new Set<string>(),
  squares: new Set<string>(),
  pawns: [],
  mates: [],
  keywords: new Set(["trapped", "fork"]),
  gameMoves: [],
  pvs: [],
});

/** 05/M1 — 36. Na7. a8 bishop: 1 legal / 1 safe; a7 knight: 3 legal / 1 safe;
 * d2 bishop: 1 legal / 1 safe. Nothing here is trapped. */
const M1_FEN_BEFORE = "B6r/1bn1k3/3p2p1/pN4Pq/PPpbp2P/2P1P3/2KB4/R3R3 w - - 1 36";
const M1_FEN_AFTER = "B6r/Nbn1k3/3p2p1/p5Pq/PPpbp2P/2P1P3/2KB4/R3R3 b - - 2 36";
/** The same position with White's a4 pawn deleted — now the a7 knight's only
 * retreat (Nb5) is uncovered and it really is boxed in (0 safe). */
const TRAPPED_FEN_AFTER = "B6r/Nbn1k3/3p2p1/p5Pq/1Ppbp2P/2P1P3/2KB4/R3R3 b - - 2 36";

const fire = { category: "tactical_keyword_unbacked", span: "trapped" };

describe("trapped-class adjudication consults the board", () => {
  it("does NOT certify a board-contradicted 'trapped' fire as a false positive", () => {
    // CI-5 cap-5 run, fire 2 (05/s1/M1), verbatim.
    const sentence =
      "The bishop on a8, the knight on a7, and the bishop on d2 all become trapped with no legal moves [F:M1].";
    expect(
      adjudicateFp(fire, pools(), {
        ...helpers,
        sentence,
        fens: [M1_FEN_BEFORE, M1_FEN_AFTER],
      }),
    ).toBe("needs-review");
  });

  it("still certifies one when every named piece really has zero safe moves", () => {
    expect(
      adjudicateFp(fire, pools(), {
        ...helpers,
        sentence: "The knight on a7 is trapped.",
        fens: [M1_FEN_BEFORE, TRAPPED_FEN_AFTER],
      }),
    ).toBe("licensed-elsewhere-in-contract");
  });

  it("one boxed-in piece does not license a claim about three", () => {
    expect(
      adjudicateFp(fire, pools(), {
        ...helpers,
        sentence: "The knight on a7 and the bishop on a8 are both trapped.",
        fens: [M1_FEN_BEFORE, TRAPPED_FEN_AFTER],
      }),
    ).toBe("needs-review");
  });

  it("no board context ⇒ no license (the rule fails closed)", () => {
    expect(
      adjudicateFp(fire, pools(), { ...helpers, sentence: "The knight on a7 is trapped." }),
    ).toBe("needs-review");
  });

  it("an unresolvable piece reference ⇒ no license", () => {
    expect(
      adjudicateFp(fire, pools(), {
        ...helpers,
        sentence: "Your position leaves that piece trapped.",
        fens: [M1_FEN_BEFORE, TRAPPED_FEN_AFTER],
      }),
    ).toBe("needs-review");
  });

  it("the rest of the tactical vocabulary keeps the contract-global license", () => {
    // Relational motifs are legitimately discussed across cards; only the
    // trapped class is a per-piece arithmetic claim.
    expect(
      adjudicateFp({ category: "tactical_keyword_unbacked", span: "fork" }, pools(), {
        ...helpers,
        sentence: "The knight on a7 sets up a fork.",
        fens: [M1_FEN_BEFORE, M1_FEN_AFTER],
      }),
    ).toBe("licensed-elsewhere-in-contract");
  });

  it("a keyword outside the pool is never licensed", () => {
    expect(
      adjudicateFp({ category: "tactical_keyword_unbacked", span: "skewer" }, pools(), helpers),
    ).toBe("needs-review");
  });
});
