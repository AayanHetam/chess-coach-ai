import { describe, it, expect } from "vitest";
import { collapseToEpisodes, episodeCountsByFamily } from "../episodes";
import type { IntentSummary } from "@/lib/contract/types";
import type { IntentFacts } from "../types";

// Raw per-ply counts overstate badly — 25 of the 34 "surviving mates" the
// module once reported were consecutive plies of ONE lost ending. Every
// consumer that quotes a number must first collapse plies into episodes and
// split by mover. This module is that collapse, built once instead of
// re-invented per consumer.

const EMPTY: IntentFacts = {
  mate: null,
  material: null,
  trap: null,
  escape: null,
  prophylaxis: null,
  unaddressedThreat: null,
  cost: null,
  purpose: "none",
  sharpness: null,
  quiet: false,
  zugzwangGuarded: false,
} as unknown as IntentFacts;

function row(
  ply: number,
  mover: "w" | "b",
  facts: Partial<IntentFacts>,
): IntentSummary {
  return {
    ply,
    mover,
    playedSan: "e4",
    tier: "tier0",
    facts: { ...EMPTY, ...facts } as IntentFacts,
  };
}

const threat = (san: string) =>
  ({ threatSan: san }) as unknown as IntentFacts["unaddressedThreat"];

describe("collapseToEpisodes", () => {
  it("collapses one mover's consecutive identical threat claims into one episode", () => {
    // The 25-consecutive-plies failure shape: same mover, same unanswered
    // threat, carded on successive turns.
    const rows = [
      row(40, "w", { unaddressedThreat: threat("Qh4") }),
      row(42, "w", { unaddressedThreat: threat("Qh4") }),
      row(44, "w", { unaddressedThreat: threat("Qh4") }),
    ];
    const eps = collapseToEpisodes(rows);
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({
      family: "unaddressedThreat",
      key: "Qh4",
      mover: "w",
      plies: [40, 42, 44],
    });
  });

  it("never merges the two movers, even on the same threat SAN", () => {
    const rows = [
      row(40, "w", { unaddressedThreat: threat("Qh4") }),
      row(41, "b", { unaddressedThreat: threat("Qh4") }),
    ];
    expect(collapseToEpisodes(rows)).toHaveLength(2);
  });

  it("an analysed same-mover ply WITHOUT the fact breaks the run", () => {
    const rows = [
      row(40, "w", { unaddressedThreat: threat("Qh4") }),
      row(42, "w", {}), // analysed, threat answered here
      row(44, "w", { unaddressedThreat: threat("Qh4") }),
    ];
    const eps = collapseToEpisodes(rows);
    expect(eps.filter((e) => e.family === "unaddressedThreat")).toHaveLength(2);
  });

  it("bridges un-analysed gaps — sparse carding must not multiply episodes", () => {
    // A review cards plies 40 and 46 but never analysed 42/44. The module has
    // no evidence the story changed in between; one episode.
    const rows = [
      row(40, "w", { unaddressedThreat: threat("Qh4") }),
      row(46, "w", { unaddressedThreat: threat("Qh4") }),
    ];
    expect(collapseToEpisodes(rows)).toHaveLength(1);
  });

  it("different threats are different episodes even when adjacent", () => {
    const rows = [
      row(40, "w", { unaddressedThreat: threat("Qh4") }),
      row(42, "w", { unaddressedThreat: threat("Nf3") }),
    ];
    expect(collapseToEpisodes(rows)).toHaveLength(2);
  });

  it("collapses a run of mate facts regardless of the shrinking distance", () => {
    const mate = (n: number) =>
      ({ inMoves: n, line: [] }) as unknown as IntentFacts["mate"];
    const rows = [
      row(50, "b", { mate: mate(9) }),
      row(52, "b", { mate: mate(8) }),
      row(54, "b", { mate: mate(6) }),
    ];
    const eps = collapseToEpisodes(rows);
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({ family: "mate", mover: "b", plies: [50, 52, 54] });
  });

  it("never collapses one-shot families — each capture is its own event", () => {
    const material = { wonCp: 100, capturedCp: 100 } as unknown as IntentFacts["material"];
    const rows = [
      row(10, "w", { material }),
      row(12, "w", { material }),
    ];
    expect(collapseToEpisodes(rows).filter((e) => e.family === "material")).toHaveLength(2);
  });

  it("one ply can open episodes in several families at once", () => {
    const rows = [
      row(20, "w", {
        unaddressedThreat: threat("Qh4"),
        cost: { playedSan: "a3", bestSan: "Nf3", costCp: 250 } as unknown as IntentFacts["cost"],
      }),
    ];
    const families = collapseToEpisodes(rows).map((e) => e.family).sort();
    expect(families).toEqual(["cost", "unaddressedThreat"]);
  });

  it("counts by family for the telemetry row", () => {
    const rows = [
      row(40, "w", { unaddressedThreat: threat("Qh4") }),
      row(42, "w", { unaddressedThreat: threat("Qh4") }),
      row(41, "b", { escape: { piece: "n", valueCp: 320 } as unknown as IntentFacts["escape"] }),
    ];
    expect(episodeCountsByFamily(rows)).toEqual({
      unaddressedThreat: 1,
      escape: 1,
    });
  });

  it("returns nothing for rows with no facts", () => {
    expect(collapseToEpisodes([row(1, "w", {}), row(3, "w", {})])).toEqual([]);
  });
});
