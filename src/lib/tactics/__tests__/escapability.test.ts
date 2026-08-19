import { describe, it, expect } from "vitest";
import { detectMotifs } from "../index";

// Consumer-level pins for the issue #350 see() rewrite: escapability uses
// see() to confirm/refute motifs, so a SEE that calls a losing capture
// profitable refutes real tactics, and a SEE that prices the king at 99999
// confirms discovered checks only by accident.

describe("applyEscapability after the see() rewrite (issue #350)", () => {
  it("keeps a discovered check confirmed — the king is not SEE material", () => {
    // Nd6+ clears the e-file: Re1 gives check to Ke8. The victim of the
    // discovered attack is the king, which the honest SEE prices at 0; the
    // explicit king guard, not the SEE gate, must confirm this motif.
    const motifs = detectMotifs("4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1", "Nd6+");
    const discovered = motifs.find((m) => m.motif === "discovered_attack");
    expect(discovered).toBeDefined();
    expect(discovered!.confirmed).toBe(true);
  });

  it("no longer lets a LOSING capture 'refute' a defended fork", () => {
    // Ne5 forks the d7-rook and f7-bishop; the knight is defended by the
    // d4-pawn. Black's only capture is Qb8xe5 — a losing trade (320 for 900).
    // The old see() scored that capture +320 and marked the fork
    // refuted-by-recapture.
    const motifs = detectMotifs("1q4k1/3r1b2/8/8/3P4/5N2/8/6K1 w - - 0 1", "Ne5");
    const fork = motifs.find((m) => m.motif === "fork");
    expect(fork).toBeDefined();
    expect(fork!.refutation?.refuted_by).not.toBe("recapture");
  });
});
