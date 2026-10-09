/**
 * Masti's marks are computed by the app, from the board, never from the
 * model's words. Read from the source:
 *
 * - boardAnnotations.ts and boardShapes.ts import nothing but chess.js, the
 *   relational facts, each other and types, and the board's brushes import
 *   nothing at all.
 * - The page builds the strip's mark in one place, from the strip's own
 *   analysis (moveAnalysis.ts over the engine data) and nothing else.
 * - A line's mark is built in one place, where a line's ply is put on the
 *   board, from the ProofLine's own caption of that ply.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Every import of a module: where from, and whether only types come in. */
function importsOf(source: string): { from: string; typeOnly: boolean }[] {
  const out: { from: string; typeOnly: boolean }[] = [];
  for (const m of Array.from(
    source.matchAll(/^import\s+([\s\S]*?)\s+from\s+"([^"]+)";/gm)
  )) {
    const clause = m[1].trim();
    const typeOnly =
      clause.startsWith("type ") ||
      (/^\{[\s\S]*\}$/.test(clause) &&
        clause
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .every((s) => s.startsWith("type ")));
    out.push({ from: m[2], typeOnly });
  }
  // A bare side-effect import, or a require, would slip past the above.
  expect(source).not.toMatch(/^import\s+"/m);
  expect(source).not.toMatch(/\brequire\(/);
  return out;
}

function expectImports(
  rel: string,
  values: readonly string[],
  types: readonly string[]
) {
  for (const imp of importsOf(read(rel))) {
    const allowed = imp.typeOnly ? [...values, ...types] : values;
    expect(allowed, `${rel} imports ${imp.from}`).toContain(imp.from);
  }
}

describe("the marks' modules", () => {
  it("boardAnnotations.ts reads the board and the story's types alone", () => {
    expectImports(
      "src/lib/coach/boardAnnotations.ts",
      ["chess.js", "@/lib/relational/relationalFactsBuilder"],
      ["@/lib/contract/lineStory"]
    );
  });

  it("boardShapes.ts reads chess.js and the marks' builder, and types", () => {
    expectImports(
      "src/components/preview-analysis/boardShapes.ts",
      ["chess.js", "@/lib/coach/boardAnnotations"],
      [
        "@/components/ui/ChessgroundBoard",
        "@/components/ui/BoardArrowToggles",
        "@/lib/coach/lineCaptions",
        "./coachLines",
      ]
    );
  });

  it("the board's brushes import nothing", () => {
    expect(importsOf(read("src/components/ui/chessgroundBrushes.ts"))).toEqual(
      []
    );
  });
});

describe("the page's marks", () => {
  const page = read("src/components/preview-analysis/AnalysisImpl.tsx");

  it("builds the strip's mark once, from the strip's analysis alone", () => {
    const calls = page.split("buildBoardAnnotation(").length - 1;
    expect(calls).toBe(1);
    const start = page.indexOf("buildBoardAnnotation({");
    expect(start).toBeGreaterThan(-1);
    const body = page.slice(
      start + "buildBoardAnnotation({".length,
      page.indexOf("})", start)
    );
    const fields = body
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(fields.map((f) => f.split(":")[0].trim()).sort()).toEqual([
      "engine",
      "facts",
      "fenBefore",
      "moveArrows",
      "played",
      "source",
    ]);
    for (const field of fields) {
      const value = field.slice(field.indexOf(":") + 1).trim();
      expect(
        /^stripAnalysis\.[\w.]+$/.test(value) ||
          value === "true" ||
          value === '"strip"',
        field
      ).toBe(true);
    }
  });

  it("builds a line's mark once, where a line's ply is put on the board", () => {
    expect(page.split("lineAnnotationAt(").length - 1).toBe(1);
    const start = page.indexOf("const handleShowLinePly = useCallback(");
    expect(start).toBeGreaterThan(-1);
    const end = page.indexOf("\n  );\n", start);
    const at = page.indexOf("lineAnnotationAt(");
    expect(at).toBeGreaterThan(start);
    expect(at).toBeLessThan(end);
  });
});
