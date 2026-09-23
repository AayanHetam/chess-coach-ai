// The /learn surface, rendered on the server.
//
// The e2e specs drive this page by its words: "Lock White", "Choose something
// as Black first", "N percent answered", the verdict. The game layer trimmed
// the copy hard, so the words the journeys depend on are pinned here too,
// where a copy edit fails in two seconds rather than in a ten-minute
// Playwright leg.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BANDS } from "@/lib/repertoire/levels";
import type { Coverage } from "@/lib/repertoire/bracket";
import type { RepertoireMap, RepertoireSlot } from "@/types/repertoire";
import { CoverageMeter } from "../CoverageMeter";
import { LockBar } from "../LockBar";
import { RepertoireHud } from "../RepertoireHud";

const improving = BANDS.find((b) => b.id === "improving")!;

const meta: RepertoireMap["meta"] = {
  source: "test",
  games: 233_000,
  band: "improving",
  bandScale: "common (chess.com)",
  openings: 3690,
  gapMaxPly: 3,
  gapMinShare: 0.02,
  steerPly: 8,
  otherFirstMoves: 0.05,
};

function slot(over: Partial<RepertoireSlot> & { id: string }): RepertoireSlot {
  return {
    side: "black", line: [], fen: "x", share: 1, name: null, eco: null,
    origin: null, moves: [], replyCoverage: 1, brief: null, choices: [], ...over,
  };
}

const sicilian = slot({ id: "white:e4 c5", line: ["e4", "c5"], name: "Sicilian Defense", side: "white" });

function cover(answered: number, open: RepertoireSlot[] = [sicilian]): Coverage {
  return {
    answered,
    filled: 1,
    open: open.map((s) => ({ slot: s, pick: null, reach: 0.25, children: [], depth: 1 })),
  };
}

const meter = (answered: number, over: Partial<Parameters<typeof CoverageMeter>[0]> = {}) =>
  renderToStaticMarkup(
    <CoverageMeter
      coverage={cover(answered)}
      side="white"
      meta={meta}
      band={improving}
      rating={1400}
      tree={null}
      roots={[]}
      pickKey={0}
      {...over}
    />
  );

describe("CoverageMeter", () => {
  it("carries exactly one accessible progress label, for the number it prints", () => {
    const html = meter(0.42);
    expect(html.match(/aria-label="42 percent answered"/g)).toHaveLength(1);
    expect(html.match(/percent answered/g)).toHaveLength(1);
    expect(html).toContain(">42%<");
  });

  it("names the rung, the distance to the next one and the band's finish line", () => {
    const html = meter(0.42);
    // improving is enough at 0.9: half built from 0.36, nearly there from 0.675.
    expect(html).toContain("Half built");
    expect(html).toContain("+26% to Nearly there");
    expect(html).toContain("enough at 90%");
  });

  it("keeps the verdict, the band and the biggest gap on the card", () => {
    const html = meter(0.42);
    expect(html).toContain("Not finished yet");
    expect(html).toContain("treating you as improving");
    expect(html).toContain("The biggest thing you have no answer for is");
    expect(html).toContain("the Sicilian Defense");
    expect(html).toContain('data-testid="corpus-provenance"');
  });

  it("goes green and stops offering a next rung once the side is enough", () => {
    const html = meter(0.95, { coverage: cover(0.95, []) });
    expect(html).toContain("Battle ready");
    expect(html).not.toContain("% to ");
    expect(html).toContain("This is enough");
    expect(html).toContain("Every branch we can measure has an answer.");
  });

  it("says whose games the numbers are", () => {
    const html = meter(0.42);
    expect(html).toContain("of games.");
    expect(html).not.toContain("your games");
  });
});

describe("RepertoireHud", () => {
  const stats = {
    white: { done: 1, enough: true, locked: true, picks: 1 },
    black: { done: 0.2, enough: false, locked: false, picks: 1 },
  };
  it("is two tabs, one selected, each with its ring and rung", () => {
    const html = renderToStaticMarkup(
      <RepertoireHud side="black" onChange={() => {}} stats={stats} band={improving} />
    );
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain("As White");
    expect(html).toContain("As Black");
    expect(html).toContain("Locked");
    expect(html).toContain("First moves");
    expect(html).toContain('data-ring-value="100"');
    expect(html).toContain('data-ring-value="20"');
    // The rings are decoration; the meter owns the accessible label.
    expect(html).not.toContain("percent answered");
  });
});

describe("LockBar", () => {
  const pick = [{ slotId: "white:", choiceId: "w-london", label: "London System" }];
  const bar = (over: Partial<Parameters<typeof LockBar>[0]> = {}) =>
    renderToStaticMarkup(
      <LockBar
        side="white"
        locked={{ white: false, black: false }}
        picks={pick}
        firstCourse="w-london"
        onToggle={() => {}}
        {...over}
      />
    );

  it("cannot lock an empty colour, and says so", () => {
    const html = bar({ picks: [] });
    expect(html).toContain("Choose something as White first.");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("says what locking finishes when the other colour is already locked", () => {
    expect(bar({ locked: { white: false, black: true } })).toContain("Lock this one too and you are done.");
    expect(bar()).toContain("Lock White");
    expect(bar({ locked: { white: true, black: false } })).toContain("White is locked");
  });

  it("offers Continue only once both colours are locked", () => {
    expect(bar({ locked: { white: true, black: false } })).not.toContain("start learning");
    const done = bar({ locked: { white: true, black: true } });
    expect(done).toContain("Continue — start learning");
    expect(done).toContain('href="/learn/w-london"');
    expect(done).toContain("Repertoire locked.");
  });
});

describe("SlotChooser", () => {
  it("opens with Masti's pick and keeps every card to a board, a name, one line and tags", async () => {
    const { default: SlotChooser } = await import("../SlotChooser");
    const shipped = (await import("@/data/repertoire-map.json")).default as unknown as RepertoireMap;
    const d4 = shipped.slots.find((s) => s.id === "black:d4")!;
    const club = BANDS.find((b) => b.id === "club")!;
    const html = renderToStaticMarkup(
      <SlotChooser
        slot={d4}
        quiz={{ load: "heavy", character: "counterattack" }}
        band={club}
        transposes={[]}
        onPick={() => {}}
        onClose={() => {}}
      />
    );
    // 1700, heavy, counterattacking: the Grünfeld lines up on every axis.
    expect(html).toContain("My pick: the Grünfeld Defence. Level, theory and style all fit.");
    expect(html).toContain("Masti&#x27;s pick");
    expect(html).toContain("heavily recommended");
    // The short coverage line, with the two numbers and no homework.
    expect(html).toMatch(/answers \d+% of 1\.d4\. You still need something for the other \d+%\./);
    expect(html).not.toContain("mostly");
    // The prose rides along as a tooltip rather than on the card.
    expect(html).toMatch(/title="[^"]+"/);
    for (const c of d4.choices) expect(html).not.toContain(`>${c.blurb}<`);
    expect(html).toContain('aria-label="Search every named opening"');
  });
});
