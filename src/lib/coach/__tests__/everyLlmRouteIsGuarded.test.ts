import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Every route that can spend provider money must run the refusal gate first.
 *
 * This is a SOURCE SCAN rather than a behavioural test on purpose. The failure
 * it guards against is drift: someone adds an eighth LLM route next month,
 * copies an older one that predates the fuse, and the ceiling silently stops
 * being a ceiling. Nothing about that shows up in a passing suite — the new
 * route works perfectly, it just doesn't pay attention to the budget.
 *
 * There is precedent for the shape: `llmStatsAggregator.recordLLMCall` is
 * called by only two of the seven LLM routes, which is exactly how a
 * per-route convention rots when nothing checks it.
 */

const API_DIR = path.join(process.cwd(), "src/app/api");

/** Every route.ts under src/app/api. */
function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(p, out);
    else if (entry.name === "route.ts") out.push(p);
  }
  return out;
}

const rel = (p: string) => path.relative(process.cwd(), p);

/**
 * Health probes are deliberately NOT gated: `/api/health/llm` is how you find
 * out the provider is reachable, so a ceiling must not switch off the
 * instrument that tells you when to raise it. aiAvailability.ts says the same.
 */
const EXEMPT = [
  "src/app/api/health/llm/route.ts",
  "src/app/api/health/anthropic/route.ts",
];

describe("every LLM-spending route runs the refusal gate", () => {
  const files = routeFiles(API_DIR);

  it("finds the route tree", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("guards every route that calls the provider", () => {
    const unguarded: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const spends = /\bcallLLM\b|\bcallLLMStream\b/.test(src);
      if (!spends || EXEMPT.includes(rel(file))) continue;
      if (!src.includes("aiRefusal(")) unguarded.push(rel(file));
    }
    expect(unguarded).toEqual([]);
  });

  it("still covers the seven routes known to spend today", () => {
    // A canary on the scan itself: if this drops to zero because the regex
    // stopped matching, the test above would pass vacuously.
    const spending = files.filter((f) => {
      const src = fs.readFileSync(f, "utf8");
      return /\bcallLLM\b|\bcallLLMStream\b/.test(src) && !EXEMPT.includes(rel(f));
    });
    expect(spending.length).toBeGreaterThanOrEqual(7);
  });
});
