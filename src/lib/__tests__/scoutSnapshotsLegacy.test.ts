import { describe, expect, it } from "vitest";
import { normalizeLegacyAnalytics } from "@/lib/scoutSnapshots";

// Snapshots written before the Tells rename stored the exploitability block as
// `analytics.stalker`. Every one of those docs backs a share link that is
// already public, so the read path has to keep resolving them.

const TELLS_BLOCK = {
  total: 73,
  predictability: "High",
  factors: [
    { id: "time_trouble", label: "Time trouble", score: 71 },
    { id: "tilts", label: "Tilts easily", score: 62 },
  ],
};

/** A stored doc in the pre-rename shape. */
function legacyDoc() {
  return {
    profile: { ovr: 66, atk: 79 },
    stalker: { ...TELLS_BLOCK },
    prep: { asWhite: {}, asBlack: {} },
    checklist: [],
  } as unknown as Record<string, unknown>;
}

describe("normalizeLegacyAnalytics", () => {
  // Control: proves the fixture genuinely reproduces the breakage. If this
  // ever fails, the fixture stopped representing a legacy doc and every other
  // assertion here is passing for the wrong reason.
  it("CONTROL: the raw legacy doc has no `tells` key for consumers to read", () => {
    const raw = legacyDoc();
    expect(raw.tells).toBeUndefined();
    expect(raw.stalker).toBeDefined();
  });

  it("maps a legacy `stalker` block onto `tells`", () => {
    const out = normalizeLegacyAnalytics(legacyDoc());

    expect(out.tells).toEqual(TELLS_BLOCK);
    expect(out.tells.total).toBe(73);
    expect(out.tells.factors).toHaveLength(2);
  });

  it("drops the legacy key so nothing downstream reads both", () => {
    const out = normalizeLegacyAnalytics(legacyDoc()) as unknown as Record<
      string,
      unknown
    >;

    expect("stalker" in out).toBe(false);
  });

  it("preserves every sibling field while remapping", () => {
    const out = normalizeLegacyAnalytics(legacyDoc());

    expect(out.profile).toEqual({ ovr: 66, atk: 79 });
    expect(out.checklist).toEqual([]);
  });

  it("leaves a fully modern doc untouched", () => {
    const modern = {
      profile: { ovr: 66 },
      tells: { ...TELLS_BLOCK },
      clockWindows: { byHour: [], byWeekday: [], sampled: 0 },
    } as unknown as Record<string, unknown>;

    const out = normalizeLegacyAnalytics(modern);

    expect(out.tells).toEqual(TELLS_BLOCK);
    expect(out).toEqual(modern);
  });

  // Clock windows landed after the rename, so there are shared links with a
  // `tells` block and no `clockWindows` at all. ClockWindowsPanel reads
  // `.byHour` directly, so an absent bundle is a crash on someone else's link,
  // not a missing section.
  it("CONTROL: a pre-clock-windows doc has no bundle for the panel to read", () => {
    expect(legacyDoc().clockWindows).toBeUndefined();
  });

  it("fills in an empty clock-windows bundle when the doc predates it", () => {
    const out = normalizeLegacyAnalytics(legacyDoc());

    expect(out.clockWindows).toEqual({ byHour: [], byWeekday: [], sampled: 0 });
    // Empty, not fabricated — the panel must render nothing, not a fake hour.
    expect(out.clockWindows.sampled).toBe(0);
    expect(out.clockWindows.weakestHour).toBeUndefined();
  });

  it("does not overwrite a bundle the doc already has", () => {
    const withWindows = {
      tells: { ...TELLS_BLOCK },
      clockWindows: { byHour: [{ key: 3, games: 9, scorePct: 22 }], byWeekday: [], sampled: 9 },
    } as unknown as Record<string, unknown>;

    expect(normalizeLegacyAnalytics(withWindows).clockWindows.sampled).toBe(9);
  });

  it("prefers `tells` if a doc somehow carries both keys", () => {
    const both = {
      tells: { ...TELLS_BLOCK, total: 99 },
      stalker: { ...TELLS_BLOCK, total: 11 },
    } as unknown as Record<string, unknown>;

    expect(normalizeLegacyAnalytics(both).tells.total).toBe(99);
  });

  it("passes undefined through rather than fabricating a shape", () => {
    expect(normalizeLegacyAnalytics(undefined)).toBeUndefined();
  });
});
