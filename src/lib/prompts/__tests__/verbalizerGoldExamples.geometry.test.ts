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

function onSameDiagonal(a: string, b: string): boolean {
  const [f1, r1] = sq(a);
  const [f2, r2] = sq(b);
  return Math.abs(f1 - f2) === Math.abs(r1 - r2) && f1 !== f2;
}

/** a → b → c are colinear on one diagonal, in that order (a pin ray). */
function isDiagonalRay(a: string, b: string, c: string): boolean {
  if (!onSameDiagonal(a, b) || !onSameDiagonal(b, c) || !onSameDiagonal(a, c)) return false;
  const [fa, ra] = sq(a);
  const [fb, rb] = sq(b);
  const [fc, rc] = sq(c);
  const stepF = Math.sign(fb - fa);
  const stepR = Math.sign(rb - ra);
  return Math.sign(fc - fb) === stepF && Math.sign(rc - rb) === stepR;
}

interface SliceMotif {
  motif: string;
  by_piece?: string;
  by_square?: string;
  targets?: Array<{ square: string; piece: string }>;
  against?: { square: string; piece: string };
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

    it(`${ex.id}: bishop motifs are diagonal, and bishop pins are a real ray`, () => {
      for (const m of slice.motifs ?? []) {
        if (m.by_piece !== "b" || !m.by_square) continue;
        for (const t of m.targets ?? []) {
          expect(
            onSameDiagonal(m.by_square, t.square),
            `bishop on ${m.by_square} cannot attack ${t.square}`,
          ).toBe(true);
          if (m.motif === "pin" && m.against) {
            expect(
              isDiagonalRay(m.by_square, t.square, m.against.square),
              `${m.by_square} → ${t.square} → ${m.against.square} is not one diagonal ray`,
            ).toBe(true);
          }
        }
      }
    });

    it(`${ex.id}: every [F:id] in the prose resolves to a fact present in the slice`, () => {
      const raw = JSON.parse(ex.contractSlice) as Record<string, unknown>;
      const prefix = raw.factIdPrefix as string;
      const len = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]).length : 0);
      const relational = raw.relational as
        | { captures?: unknown[]; hanging?: unknown[]; pins?: unknown[] }
        | undefined;
      const relCount =
        (relational?.captures?.length ?? 0) +
        (relational?.hanging?.length ?? 0) +
        (relational?.pins?.length ?? 0);
      const sized: Record<string, number> = {
        pv: len("lines"),
        motif: len("motifs"),
        rel: relCount,
        threat: len("threats"),
        concept: len("concepts"),
      };
      const scalars: Record<string, boolean> = {
        idea: raw.engineIdea !== undefined,
        branch: raw.branchPoint !== undefined,
        delta: raw.featureDelta !== undefined,
      };
      for (const m of Array.from(ex.idealProse.matchAll(/\[F:([A-Za-z0-9_.-]{1,40})\]/g))) {
        const id = m[1];
        if (id === prefix) continue;
        expect(id.startsWith(`${prefix}.`), `citation ${id} is not on insight ${prefix}`).toBe(true);
        const suffix = id.slice(prefix.length + 1);
        const indexed = suffix.match(/^([a-z]+)(\d{1,2})$/);
        if (indexed) {
          const [, family, n] = indexed;
          expect(sized[family], `unknown citation family "${family}" in ${id}`).toBeDefined();
          expect(Number(n), `${id} indexes past the slice's ${family} array`).toBeLessThan(
            sized[family],
          );
        } else {
          expect(scalars[suffix], `${id} cites a field absent from the slice`).toBe(true);
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
