import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ABSENCE_CLAUSE,
  momentToText,
  type MomentProse,
} from "@/lib/coach/moment";
import {
  FOLLOWUP_MOMENTS_DEFAULT,
  isFollowUpMomentsEnabledPublic,
  momentIsText,
  momentView,
  readMomentProse,
  readServedMoment,
} from "../followUpMoment";

const FULL: MomentProse = {
  idea: "You saw the fork on c7, and forks are worth seeing",
  happens:
    "But 8. Qxc1 wins a queen outright, and the fork hands Black a check that wins yours back.",
  proof: { kind: "engine", moveNumber: 8, color: "w" },
  lesson: {
    pattern: "the loose piece",
    check:
      "Before any check or fork, list every capture your opponent has in reply",
  },
  question:
    "Black has just checked on d1: which recapture keeps your rook safe",
  more: null,
  omitted: [],
};

describe("the moments flag", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is off by default and the env turns it either way", () => {
    expect(FOLLOWUP_MOMENTS_DEFAULT).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_COACH_FOLLOWUP_MOMENTS", "");
    expect(isFollowUpMomentsEnabledPublic()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_COACH_FOLLOWUP_MOMENTS", "1");
    expect(isFollowUpMomentsEnabledPublic()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_COACH_FOLLOWUP_MOMENTS", "off");
    expect(isFollowUpMomentsEnabledPublic()).toBe(false);
  });
});

describe("readServedMoment", () => {
  const text = momentToText(FULL);

  it("reads the moment the route sent beside its own projection", () => {
    expect(readServedMoment(JSON.parse(JSON.stringify(FULL)), text)).toEqual(
      FULL
    );
  });

  it("is the answer only when its projection is the served text", () => {
    // The referee dropped a sentence after the turn was fielded.
    const cut = text.replace(/But 8\. Qxc1[^.]*\.\s*/, "");
    expect(readServedMoment(FULL, cut)).toBeNull();
    // Whitespace alone is the same answer.
    expect(readServedMoment(FULL, text.replace(/ /g, "  "))).toEqual(FULL);
    // A banner that overwrote the answer.
    expect(readServedMoment(FULL, "**Coach is offline** (HTTP 502).")).toBe(
      null
    );
  });

  it("refuses any field of the wrong shape", () => {
    const bad = (patch: Record<string, unknown>) =>
      readServedMoment({ ...FULL, ...patch }, text);
    expect(bad({ idea: 3 })).toBeNull();
    expect(bad({ proof: { kind: "maia", moveNumber: 8, color: "w" } })).toBe(
      null
    );
    expect(bad({ proof: { kind: "engine", moveNumber: 0, color: "w" } })).toBe(
      null
    );
    expect(
      bad({ proof: { kind: "engine", moveNumber: 8, color: "white" } })
    ).toBeNull();
    expect(bad({ lesson: "the loose piece" })).toBeNull();
    expect(bad({ omitted: ["idea", "board"] })).toBeNull();
    expect(bad({ omitted: "idea" })).toBeNull();
    expect(readServedMoment(null, text)).toBeNull();
    expect(readServedMoment([FULL], text)).toBeNull();
    expect(readServedMoment("moment", text)).toBeNull();
  });

  it("reads an absent `more` as none", () => {
    const rest: Record<string, unknown> = { ...FULL };
    delete rest.more;
    expect(readServedMoment(rest, text)).toEqual(FULL);
  });

  it("checks the shapes in readMomentProse, which reads no text", () => {
    // A turn-1 moment (cardMoment.ts) carries the wire's other fields too:
    // only the prose is read, and the text it is beside is not asked for.
    const wire = { ...FULL, fen: "8/8/8/8/8/8/8/8 w - - 0 1", ply: 14 };
    expect(readMomentProse(JSON.parse(JSON.stringify(wire)))).toEqual(FULL);
    expect(readMomentProse({ ...FULL, happens: 3 })).toBeNull();
    expect(readMomentProse({ ...FULL, omitted: ["board"] })).toBeNull();
    expect(readMomentProse(null)).toBeNull();
  });

  it("never draws a moment whose projection is empty", () => {
    const empty: MomentProse = {
      idea: null,
      happens: null,
      proof: null,
      lesson: null,
      question: null,
      more: null,
      omitted: [],
    };
    expect(momentIsText(empty, "")).toBe(false);
  });
});

describe("momentView", () => {
  it("draws the idea and what happens as two lines, with the proof, the lesson and the question", () => {
    const v = momentView(FULL);
    expect(v.lines).toEqual([
      {
        field: "idea",
        text: "You saw the fork on c7, and forks are worth seeing.",
        absent: false,
      },
      {
        field: "happens",
        text: "But 8. Qxc1 wins a queen outright, and the fork hands Black a check that wins yours back.",
        absent: false,
      },
    ]);
    expect(v.proof).toEqual(FULL.proof);
    expect(v.lesson).toBe(
      "**The loose piece.** Before any check or fork, list every capture your opponent has in reply."
    );
    expect(v.question).toBe(
      "Black has just checked on d1: which recapture keeps your rook safe?"
    );
  });

  it("the lines are the text's first paragraph, word for word", () => {
    const v = momentView(FULL);
    expect(momentToText(FULL).split("\n\n")[0]).toBe(
      v.lines.map((l) => l.text).join(" ")
    );
  });

  it("puts the app's clause where a removed field stood, and none for a lesson or a question", () => {
    const v = momentView({
      ...FULL,
      happens: null,
      proof: null,
      lesson: null,
      question: null,
      omitted: ["happens", "proof", "lesson", "question"],
    });
    expect(v.lines).toEqual([
      expect.objectContaining({ field: "idea", absent: false }),
      { field: "happens", text: ABSENCE_CLAUSE.happens, absent: true },
      { field: "proof", text: ABSENCE_CLAUSE.proof, absent: true },
    ]);
    expect(v.proof).toBeNull();
    expect(v.lesson).toBeNull();
    expect(v.question).toBeNull();
  });

  it("a pattern with emphasis of its own is not wrapped in more of it", () => {
    expect(
      momentView({
        ...FULL,
        lesson: { pattern: "the *loose* piece", check: "count captures" },
      }).lesson
    ).toBe("The *loose* piece. count captures.");
  });

  it("a lesson with no check or no name is its one sentence", () => {
    expect(
      momentView({ ...FULL, lesson: { pattern: "", check: "count captures" } })
        .lesson
    ).toBe("Count captures.");
    expect(
      momentView({
        ...FULL,
        lesson: { pattern: "the loose piece", check: "" },
      }).lesson
    ).toBe("The loose piece.");
  });
});
