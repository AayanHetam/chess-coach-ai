import { describe, expect, it } from "vitest";
import { VERBALIZER_GOLD_EXAMPLES } from "../verbalizerGoldExamples";

/**
 * Geometry validation for the gold examples' contract slices.
 *
 * Origin: Aayan caught (2026-08-10) that example 1 claimed a knight on e6
 * forking d7 — a knight on e6 cannot attack d7. The example CONTRACT was
 * invented prose-first, so the citation machinery "verified" a fabrication.
 * The few-shots teach the model its epistemics; they must be board-true.
 * This test mechanically pins knight-motif geometry so the class of error
 * cannot recur silently.
 */

function sq(square: string): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = square.charCodeAt(1) - 49;
  expect(file).toBeGreaterThanOrEqual(0);
  expect(file).toBeLessThan(8);
  expect(rank).toBeGreaterThanOrEqual(0);
  expect(rank).toBeLessThan(8);
  return [file, rank];
}

function knightAttacks(from: string, to: string): boolean {
  const [f1, r1] = sq(from);
  const [f2, r2] = sq(to);
  const df = Math.abs(f1 - f2);
  const dr = Math.abs(r1 - r2);
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
}

interface SliceMotif {
  motif: string;
  by_piece?: string;
  by_square?: string;
  targets?: Array<{ square: string; piece: string }>;
}

describe("verbalizer gold examples — contract slices are board-consistent", () => {
  for (const ex of VERBALIZER_GOLD_EXAMPLES) {
    const slice = JSON.parse(ex.contractSlice) as {
      motifs?: SliceMotif[];
      evalBefore?: { display: string };
      evalAfter?: { display: string };
    };

    it(`${ex.id}: knight motifs have knight-reachable targets`, () => {
      for (const m of slice.motifs ?? []) {
        if (m.by_piece !== "n" || !m.by_square) continue;
        for (const t of m.targets ?? []) {
          expect(
            knightAttacks(m.by_square, t.square),
            `knight on ${m.by_square} cannot attack ${t.square}`,
          ).toBe(true);
        }
      }
    });

    it(`${ex.id}: every eval display quoted in the prose exists in the slice`, () => {
      const displays = [slice.evalBefore?.display, slice.evalAfter?.display].filter(
        (d): d is string => !!d && d !== "engine data unavailable",
      );
      const quoted = ex.idealProse.match(/[+-]\d+\.\d{2}/g) ?? [];
      for (const q of quoted) {
        const inSlice =
          displays.includes(q) || ex.contractSlice.includes(`"${q}"`);
        expect(inSlice, `prose quotes ${q}, absent from contract slice`).toBe(true);
      }
    });
  }
});
