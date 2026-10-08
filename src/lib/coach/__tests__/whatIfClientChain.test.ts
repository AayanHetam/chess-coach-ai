import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The client reads a what-if with the chat route's own resolvers
 * (questionAnchor.ts, questionIntent.ts), so the two agree on the move
 * asked about. Those resolvers used to reach the prompt module for the
 * walkthrough test, and the prompt text would have gone into the browser
 * bundle with them. The test moved to questionShape.ts; this scan keeps
 * the chain from the page's what-if down to the resolvers clear of
 * lib/prompts and of the API routes, transitively, following the value
 * imports a bundler would follow (type-only imports are erased).
 */

const SRC = path.join(process.cwd(), "src");
const ROOTS = [
  "components/preview-analysis/WhatIfLine.tsx",
  "components/preview-analysis/coachWhatIf.ts",
  "lib/coach/questionAnchor.ts",
  "lib/coach/questionIntent.ts",
  "lib/coach/questionShape.ts",
];
const FORBIDDEN = ["lib/prompts/", "app/api/"];

const IMPORT_RE =
  /\b(import|export)\s+(type\s+)?(?:[^'";]*?\s)?from\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null; // a package
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  }
  return null;
}

/** Every src file reached from `root` by value imports, with the chain that reached it. */
function reach(root: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const stack: Array<{ file: string; chain: string[] }> = [
    { file: root, chain: [] },
  ];
  while (stack.length > 0) {
    const { file, chain } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.set(file, chain);
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const m of Array.from(text.matchAll(IMPORT_RE))) {
      if (m[2]) continue; // import type / export type
      const spec = m[3] ?? m[4];
      const target = resolveSpec(file, spec);
      if (target) stack.push({ file: target, chain: [...chain, file] });
    }
  }
  return seen;
}

const rel = (p: string) => path.relative(SRC, p).split(path.sep).join("/");

describe("the client what-if chain", () => {
  for (const root of ROOTS) {
    it(`${root} reaches nothing under ${FORBIDDEN.join(" or ")}`, () => {
      const reached = reach(path.join(SRC, root));
      const bad = Array.from(reached.entries())
        .filter(([file]) => FORBIDDEN.some((f) => rel(file).startsWith(f)))
        .map(
          ([file, chain]) => `${[...chain, file].map(rel).join("\n    -> ")}`
        );
      expect(bad, bad.join("\n\n")).toEqual([]);
    });
  }

  it("the scan itself sees the chain it guards", () => {
    const reached = reach(
      path.join(SRC, "components/preview-analysis/coachWhatIf.ts")
    );
    const files = Array.from(reached.keys()).map(rel);
    expect(files).toContain("lib/coach/questionAnchor.ts");
    expect(files).toContain("lib/coach/questionIntent.ts");
    expect(files).toContain("lib/coach/questionShape.ts");
  });
});
