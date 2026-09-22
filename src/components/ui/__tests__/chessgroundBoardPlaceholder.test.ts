import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every dynamic import of ChessgroundBoard must reserve the board's square.
 *
 * ─── THE BUG THIS EXISTS FOR ──────────────────────────────────────────────
 * chessground touches `document` at import time, so every callsite loads the
 * board through `next/dynamic` with `ssr: false`. A dynamic import with no
 * `loading` option renders **null** until its chunk arrives, and the board's
 * wrapper on /analysis sizes itself off its child (`height: auto`). Null
 * child, therefore zero pixels tall — for as long as the fetch took — and
 * then 306px tall in the next frame, taking the coach panel below it along.
 *
 * Measured on production, 2026-09-22, on a 4x-throttled phone over slow 4G:
 * 0.340 CLS on /analysis, the single worst layout shift on the site. With
 * ChessgroundBoardPlaceholder as `loading`, 0.0008.
 *
 * ─── WHY A SOURCE TEST ────────────────────────────────────────────────────
 * The obvious end-to-end assertion — "the board is square" — passes on the
 * broken code, because the board IS square once it finally renders. The
 * defect is in the gap before that, which a browser test can only catch by
 * stalling a hashed chunk URL at exactly the right moment.
 *
 * The invariant is a property of the source, so it is checked in the source,
 * the same way partnerSlot.test.ts reads next.config.js as text to prove
 * every registered advertiser has a rewrite. Cheap, deterministic, and it
 * fails with a message naming the file that dropped the option.
 *
 * tests/e2e/local/layout-stability.spec.ts holds the /analysis CLS budget
 * that this protects; this is the one that says why it went red.
 */

const SRC = join(process.cwd(), "src");

/** Every .ts/.tsx file under src/, recursively. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * The `dynamic( ... )` call that wraps a ChessgroundBoard import, as text.
 *
 * Scans forward from `dynamic(` counting parentheses, so the slice is the
 * whole call however it is formatted or wrapped by Prettier.
 */
function dynamicCallsFor(source: string, needle: string): string[] {
  const calls: string[] = [];
  for (
    let i = source.indexOf("dynamic(");
    i > -1;
    i = source.indexOf("dynamic(", i + 1)
  ) {
    let depth = 0;
    let end = i;
    for (let j = source.indexOf("(", i); j < source.length; j++) {
      if (source[j] === "(") depth++;
      else if (source[j] === ")") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    const call = source.slice(i, end + 1);
    if (call.includes(needle)) calls.push(call);
  }
  return calls;
}

describe("ChessgroundBoard dynamic imports", () => {
  const files = sourceFiles(SRC);

  const callsites = files.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    if (!source.includes('import("@/components/ui/ChessgroundBoard")'))
      return [];
    return dynamicCallsFor(source, "@/components/ui/ChessgroundBoard").map(
      (call) => ({ file: file.slice(SRC.length + 1), call })
    );
  });

  it("finds the callsites it is meant to guard", () => {
    // A rename that made the scan match nothing would otherwise turn this
    // whole file into a test that asserts an empty list, and pass forever.
    // Three today: /analysis, the puzzle surfaces, and the ChessUSA preview.
    // The landing page's puzzle-of-the-day board was the fourth until the
    // 2026-09-22 home page cleanup removed that section.
    expect(callsites.length).toBeGreaterThanOrEqual(3);
  });

  it.each(callsites.map((c) => c.file))(
    "%s reserves the board's square while the chunk loads",
    (file) => {
      for (const { call } of callsites.filter((c) => c.file === file)) {
        expect(
          call,
          `${file} loads ChessgroundBoard with next/dynamic but passes no ` +
            "`loading`, so the board is zero pixels tall until its chunk " +
            "arrives. Pass `loading: () => <ChessgroundBoardPlaceholder />`."
        ).toMatch(/loading\s*:/);
      }
    }
  );

  it("all of them use the shared placeholder rather than a local one", () => {
    // One definition of "the space a board occupies", so it cannot drift out
    // of step with ChessgroundBoard's own outer element.
    for (const { file, call } of callsites) {
      expect(call, `${file} should use ChessgroundBoardPlaceholder`).toContain(
        "ChessgroundBoardPlaceholder"
      );
    }
  });
});
