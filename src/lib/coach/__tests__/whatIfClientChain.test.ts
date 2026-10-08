import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

/**
 * The client reads a what-if with the chat route's own resolvers
 * (questionAnchor.ts, questionIntent.ts), so the two agree on the move
 * asked about. Those resolvers used to reach the prompt module for the
 * walkthrough test, and the prompt text would have gone into the browser
 * bundle with them. The test moved to questionShape.ts; this scan keeps
 * the chain from the page's what-if down to the resolvers clear of
 * lib/prompts and of the API routes, transitively, following the value
 * imports a bundler would follow (type-only imports are erased). The
 * imports are read with the TypeScript parser, not a pattern, so a comment
 * inside an import's braces, a side-effect import, an `import()` or a
 * `require()` cannot slip a module past it.
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

/** The module specifiers a file loads at run time: type-only imports and exports are erased and left out. */
export function valueImports(file: string, text: string): string[] {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const typeOnly =
        !!clause &&
        (clause.isTypeOnly ||
          (!clause.name &&
            !!clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((e) => e.isTypeOnly)));
      if (!typeOnly) out.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      out.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      out.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

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
    for (const spec of valueImports(file, text)) {
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

describe("the import reader the scan rests on", () => {
  it("reads the shapes a pattern would miss, and leaves type-only imports out", () => {
    const text = [
      "import { a, // the player's move",
      '  b } from "@/lib/prompts/one";',
      'import "@/lib/prompts/two";',
      'const c = require("@/lib/prompts/three");',
      'const d = () => import("@/lib/prompts/four");',
      'export { e } from "@/lib/prompts/five";',
      'import type { F } from "@/lib/prompts/six";',
      'import { type G } from "@/lib/prompts/seven";',
      'export type { H } from "@/lib/prompts/eight";',
    ].join("\n");
    expect(valueImports("x.ts", text)).toEqual([
      "@/lib/prompts/one",
      "@/lib/prompts/two",
      "@/lib/prompts/three",
      "@/lib/prompts/four",
      "@/lib/prompts/five",
    ]);
  });
});
