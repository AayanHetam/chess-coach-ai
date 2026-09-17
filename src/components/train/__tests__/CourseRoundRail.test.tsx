// The counter on the mobile strip, on the one round shape that broke it.
//
// A miss appends the decision to the back of the timeline, so a round of five
// can be eight questions long. The strip counted against the round size and
// printed "position 8 of 5"; a learner sent the screenshot. The dots are a
// different number — correct answers out of five — and stay that way.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseRoundStrip } from "../CourseRoundRail";

const tally = { unseen: 3, learning: 2, known: 0, total: 5, open: 5 };

function strip(overrides: Partial<Parameters<typeof CourseRoundStrip>[0]> = {}) {
  return renderToStaticMarkup(
    <CourseRoundStrip
      title="1.b3 e5"
      round={1}
      rounds={4}
      progress={3}
      size={5}
      tally={tally}
      asked={8}
      asks={9}
      onExit={() => {}}
      onRestart={() => {}}
      {...overrides}
    />
  );
}

describe("CourseRoundStrip", () => {
  it("counts the position against the timeline, which grows on a miss", () => {
    const html = strip();
    expect(html).toContain("position 8 of 9");
    expect(html).not.toContain("position 8 of 5");
  });

  it("still fills the dots out of the round size", () => {
    const html = strip();
    expect(html).toContain('aria-label="3 of 5 answered"');
  });

  it("reads the same as the round size while nothing has been missed", () => {
    expect(strip({ asked: 2, asks: 5, progress: 1 })).toContain("position 2 of 5");
  });
});
