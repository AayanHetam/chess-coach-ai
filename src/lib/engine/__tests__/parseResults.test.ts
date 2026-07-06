import { describe, it, expect } from "vitest";

import { sortLines } from "../helpers/parseResults";
import type { LineEval } from "@/types/eval";

const line = (partial: Partial<LineEval>): LineEval => ({
  pv: [],
  depth: 20,
  multiPv: 1,
  ...partial,
});

// sortLines runs BEFORE white-centric normalization: scores are side-to-move
// perspective, so mate > 0 = we deliver mate (best), mate < 0 = we get mated.
describe("sortLines", () => {
  it("ranks a delivering-mate line above a getting-mated line (mixed signs)", () => {
    // Regression: `a.mate - b.mate` ranked mate:-3 (we get mated) ABOVE
    // mate:+2 (we mate) — lines[0], used everywhere as "the eval", was the
    // losing line whenever multipv returned one of each.
    const mating = line({ mate: 2 });
    const mated = line({ mate: -3 });
    expect([mated, mating].sort(sortLines)[0]).toBe(mating);
    expect([mating, mated].sort(sortLines)[0]).toBe(mating);
  });

  it("ranks faster mates first when both lines deliver mate", () => {
    const m2 = line({ mate: 2 });
    const m5 = line({ mate: 5 });
    expect([m5, m2].sort(sortLines)[0]).toBe(m2);
  });

  it("ranks slower losses first when both lines get mated", () => {
    // Being mated in 5 is better (longer survival) than being mated in 3.
    const mated3 = line({ mate: -3 });
    const mated5 = line({ mate: -5 });
    expect([mated3, mated5].sort(sortLines)[0]).toBe(mated5);
  });

  it("ranks a delivering-mate line above any cp line", () => {
    const mating = line({ mate: 3 });
    const cpLine = line({ cp: 500 });
    expect([cpLine, mating].sort(sortLines)[0]).toBe(mating);
  });

  it("ranks any cp line above a getting-mated line", () => {
    const mated = line({ mate: -2 });
    const cpLine = line({ cp: -300 });
    expect([mated, cpLine].sort(sortLines)[0]).toBe(cpLine);
  });

  it("sorts cp lines descending", () => {
    const a = line({ cp: -50 });
    const b = line({ cp: 120 });
    expect([a, b].sort(sortLines)[0]).toBe(b);
  });
});
