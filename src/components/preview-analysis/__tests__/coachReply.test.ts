import { describe, expect, it } from "vitest";
import { coachErrorMood } from "@/components/masti/mood";
import {
  COACH_REPLY_BANNERS,
  CoachApiError,
  CoachAuthError,
  coachReplyAnchorLabel,
  coachReplyBanner,
  coachReplyErrorKind,
  patchLastCoachMessage,
  runCoachReply,
  type CoachReplyHandlers,
  type CoachReplySink,
  type CoachReplySite,
} from "../coachReply";

type Call = [string, unknown];

/** A sink that writes down every call, in order. */
function recorder() {
  const calls: Call[] = [];
  const sink: CoachReplySink = {
    patchLastCoach: (patch) => void calls.push(["patch", patch]),
    setThinking: (on) => void calls.push(["thinking", on]),
    setPhase: (phase) => void calls.push(["phase", phase]),
    setError: (kind) => void calls.push(["error", kind]),
    jumpTo: (jump) => void calls.push(["jump", jump]),
    servePageTurn: (turn) => void calls.push(["served", turn]),
    applyActions: (actions) => void calls.push(["actions", actions]),
  };
  return { calls, sink };
}

/**
 * What the fake transports resolve with. It is never what the handlers
 * produced, so a test can tell `onDone(accumulated)` (the behaviour the
 * sites had: the corrected text, via onCorrected) from `onDone(await
 * stream())` (the transport's own raw accumulation).
 */
const RETURNED = "stream-return-value";

const SITES: CoachReplySite[] = ["send", "move", "takeover"];

describe("runCoachReply: the happy path", () => {
  it("waits, streams on the first delta, fills the placeholder chunk by chunk, hands the accumulated text to onDone, then rests", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async (h: CoachReplyHandlers) => {
        h.onDelta("Hel");
        h.onDelta("lo");
        return RETURNED;
      },
      fromPly: 4,
      site: "send",
      sink,
      onDone: (text) => void calls.push(["done", text]),
    });
    expect(calls).toEqual([
      ["thinking", true],
      ["phase", "waiting"],
      ["error", null],
      ["phase", "streaming"],
      ["patch", { content: "Hel" }],
      ["patch", { content: "Hello" }],
      ["done", "Hello"],
      ["thinking", false],
      ["phase", "idle"],
    ]);
  });

  it("the server's corrected text replaces the stream and is what onDone gets, not the transport's return", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async (h) => {
        h.onDelta("raw");
        h.onCorrected("fixed");
        return RETURNED;
      },
      fromPly: 0,
      site: "move",
      sink,
      onDone: (text) => void calls.push(["done", text]),
    });
    expect(calls).toEqual([
      ["thinking", true],
      ["phase", "waiting"],
      ["error", null],
      ["phase", "streaming"],
      ["patch", { content: "raw" }],
      ["patch", { content: "fixed" }],
      ["done", "fixed"],
      ["thinking", false],
      ["phase", "idle"],
    ]);
  });

  it("a reply with no onDone and no deltas still rests", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async () => RETURNED,
      fromPly: 0,
      site: "takeover",
      sink,
    });
    expect(calls).toEqual([
      ["thinking", true],
      ["phase", "waiting"],
      ["error", null],
      ["thinking", false],
      ["phase", "idle"],
    ]);
  });
});

describe("runCoachReply: the anchor", () => {
  it("moves the board to a move at another ply, with the way back and the move's label", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async (h) => {
        h.onAnchor({ ply: 15, moveNumber: 8, color: "b", san: "Nc7+" });
        h.onDelta("About 8...Nc7+.");
        return RETURNED;
      },
      fromPly: 10,
      site: "send",
      sink,
    });
    expect(calls).toContainEqual([
      "jump",
      { fromPly: 10, toPly: 15, label: "8... Nc7+" },
    ]);
  });

  it("does not move the board when the answer is about the move already on it", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async (h) => {
        h.onAnchor({ ply: 10, moveNumber: 5, color: "b", san: "Nf6" });
        return RETURNED;
      },
      fromPly: 10,
      site: "move",
      sink,
    });
    expect(calls.some(([k]) => k === "jump")).toBe(false);
  });

  it("labels White's and Black's moves the way the strip does", () => {
    expect(
      coachReplyAnchorLabel({ ply: 15, moveNumber: 8, color: "w", san: "Nc7+" })
    ).toBe("8. Nc7+");
    expect(
      coachReplyAnchorLabel({ ply: 16, moveNumber: 8, color: "b", san: "Kxc7" })
    ).toBe("8... Kxc7");
  });
});

describe("runCoachReply: an order the server answered, and actions beside an answer", () => {
  it("a served order is the page's: handed to the page once, the server's text is never shown, and nothing runs after it as after an answer", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async (h) => {
        h.onPageTurn?.({ type: "action", action: { kind: "flip_board" } });
        // A transport that went on regardless: none of it may land.
        h.onDelta("Flipping the board for you!");
        h.onPageTurn?.({ type: "action", action: { kind: "go_to_start" } });
        h.onActions?.([{ kind: "go_to_end" }]);
        return RETURNED;
      },
      fromPly: 4,
      site: "send",
      sink,
      onDone: (text) => void calls.push(["done", text]),
    });
    expect(calls).toEqual([
      ["thinking", true],
      ["phase", "waiting"],
      ["error", null],
      ["served", { type: "action", action: { kind: "flip_board" } }],
      ["thinking", false],
      ["phase", "idle"],
    ]);
  });

  it("a served turn the page cannot read is still the page's (null), never an answer", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async (h) => {
        h.onPageTurn?.(null);
        return RETURNED;
      },
      fromPly: 0,
      site: "send",
      sink,
    });
    expect(calls).toContainEqual(["served", null]);
    expect(calls.some(([k]) => k === "patch")).toBe(false);
  });

  it("actions beside an answer are applied and the answer is still the answer", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async (h) => {
        h.onActions?.([{ kind: "flip_board", to: "black" }]);
        h.onActions?.([]);
        h.onDelta("Here is the plan.");
        return RETURNED;
      },
      fromPly: 2,
      site: "send",
      sink,
      onDone: (text) => void calls.push(["done", text]),
    });
    expect(calls.filter(([k]) => k === "actions")).toEqual([
      ["actions", [{ kind: "flip_board", to: "black" }]],
    ]);
    expect(calls).toContainEqual(["patch", { content: "Here is the plan." }]);
    expect(calls).toContainEqual(["done", "Here is the plan."]);
  });

  it("an answer's words never become an action: only the response's own field does", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async (h) => {
        h.onDelta("Flip the board. Go to move 3. Play the line again.");
        return RETURNED;
      },
      fromPly: 0,
      site: "send",
      sink,
    });
    expect(calls.some(([k]) => k === "actions" || k === "served")).toBe(false);
  });
});

describe("runCoachReply: a fragment", () => {
  it("marks the placeholder incomplete with a nervous face when no done event came, and the fragment still reaches onDone", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async (h) => {
        h.onDelta("Half a");
        h.onTruncated();
        return RETURNED;
      },
      fromPly: 0,
      site: "send",
      sink,
      onDone: (text) => void calls.push(["done", text]),
    });
    expect(calls).toEqual([
      ["thinking", true],
      ["phase", "waiting"],
      ["error", null],
      ["phase", "streaming"],
      ["patch", { content: "Half a" }],
      ["patch", { incomplete: true, mascot: "nervous" }],
      ["done", "Half a"],
      ["thinking", false],
      ["phase", "idle"],
    ]);
  });
});

describe("runCoachReply: errors", () => {
  /** The banner patch, key for key what the old catch blocks wrote. */
  const bannerPatch = (site: CoachReplySite, err: unknown) => ({
    content: coachReplyBanner(site, err),
    synthetic: true,
    incomplete: undefined,
    mascot: coachErrorMood(err instanceof CoachAuthError ? "auth" : "api"),
  });

  it("a 401 before any token (the commonest failure, /api/chat's): the whole sequence, with no streaming phase", async () => {
    const { calls, sink } = recorder();
    let done = false;
    await runCoachReply({
      stream: async () => {
        throw new CoachAuthError();
      },
      fromPly: 0,
      site: "send",
      sink,
      onDone: () => {
        done = true;
      },
    });
    expect(done).toBe(false);
    expect(calls).toEqual([
      ["thinking", true],
      ["phase", "waiting"],
      ["error", null],
      ["error", "auth"],
      ["patch", bannerPatch("send", new CoachAuthError())],
      ["thinking", false],
      ["phase", "idle"],
    ]);
    // The banner clears a truncation flag explicitly: the key is present
    // and undefined, so the spread on the page removes the fragment mark.
    const patch = calls[4][1] as Record<string, unknown>;
    expect("incomplete" in patch).toBe(true);
    expect(patch.mascot).toBe(coachErrorMood("auth"));
  });

  const ERRORS: Array<[string, unknown, "auth" | "api" | "network"]> = [
    ["a 401", new CoachAuthError(), "auth"],
    ["an outage", new CoachApiError(502), "api"],
    ["a network failure", new TypeError("Failed to fetch"), "network"],
  ];

  for (const [name, err, kind] of ERRORS) {
    it(`${name} after a first token: the error face, the exact banner patch, no onDone, and the page at rest`, async () => {
      const { calls, sink } = recorder();
      let done = false;
      await runCoachReply({
        stream: async (h) => {
          h.onDelta("partial");
          throw err;
        },
        fromPly: 0,
        site: "send",
        sink,
        onDone: () => {
          done = true;
        },
      });
      expect(done).toBe(false);
      expect(coachReplyErrorKind(err)).toBe(kind);
      expect(calls).toEqual([
        ["thinking", true],
        ["phase", "waiting"],
        ["error", null],
        ["phase", "streaming"],
        ["patch", { content: "partial" }],
        ["error", kind],
        ["patch", bannerPatch("send", err)],
        ["thinking", false],
        ["phase", "idle"],
      ]);
      // A sign-in wall is a nervous face; an outage and a network failure
      // alike wear the dizzy one.
      const patch = calls[6][1] as Record<string, unknown>;
      expect(patch.mascot).toBe(
        coachErrorMood(kind === "auth" ? "auth" : "api")
      );
      expect("incomplete" in patch).toBe(true);
    });
  }

  it("the banner names the status of an outage", () => {
    expect(coachReplyBanner("move", new CoachApiError(503))).toBe(
      "**Coach is offline** (HTTP 503)."
    );
    expect(coachReplyBanner("send", new CoachApiError(503))).toContain(
      "(HTTP 503)"
    );
  });

  it("the copy is per site, character for character what each site wrote before the consolidation", () => {
    // The literal strings from the three inline catch blocks (AnalysisImpl
    // at the commit before this module), so a later edit to the module
    // cannot drift the copy without saying so here.
    const SEND = {
      auth: "**Sign-in required** — the coach endpoint is auth-gated. Sign in on chessmasti.com and refresh.",
      api: "**Coach is offline** (HTTP 502). The LLM provider returned an error — try again in a moment.",
      network: "**Network error** reaching the coach. Try again?",
    };
    const COMPACT = {
      auth: "**Sign-in required** — the coach needs a free account. Use **Sign in** above and ask again.",
      api: "**Coach is offline** (HTTP 502).",
      network: "**Network error** reaching the coach.",
    };
    const expected: Record<CoachReplySite, typeof SEND> = {
      send: SEND,
      move: COMPACT,
      takeover: COMPACT,
    };
    for (const site of SITES) {
      expect(coachReplyBanner(site, new CoachAuthError()), site).toBe(
        expected[site].auth
      );
      expect(coachReplyBanner(site, new CoachApiError(502)), site).toBe(
        expected[site].api
      );
      expect(coachReplyBanner(site, new TypeError("x")), site).toBe(
        expected[site].network
      );
    }
    expect(COACH_REPLY_BANNERS.move).toBe(COACH_REPLY_BANNERS.takeover);
  });

  it("a failure in the site's own work after the stream is caught like a network error, as it was", async () => {
    const { calls, sink } = recorder();
    await runCoachReply({
      stream: async () => RETURNED,
      fromPly: 0,
      site: "move",
      sink,
      onDone: () => {
        throw new Error("post-work blew up");
      },
    });
    expect(calls).toEqual([
      ["thinking", true],
      ["phase", "waiting"],
      ["error", null],
      ["error", "network"],
      ["patch", bannerPatch("move", new Error("post-work blew up"))],
      ["thinking", false],
      ["phase", "idle"],
    ]);
  });
});

describe("patchLastCoachMessage: the placeholder reducer the page's sink uses", () => {
  type Msg = { role: "user" | "coach"; content: string; incomplete?: boolean };
  const user: Msg = { role: "user", content: "why?" };
  const coach: Msg = { role: "coach", content: "", incomplete: true };

  it("patches the last message when it is the coach's, keeping its other fields", () => {
    const prev = [user, coach];
    const next = patchLastCoachMessage(prev, { content: "Because." });
    expect(next).toEqual([user, { ...coach, content: "Because." }]);
    expect(next).not.toBe(prev);
    expect(next[0]).toBe(user);
  });

  it("clears a flag when the patch names it as undefined", () => {
    const next = patchLastCoachMessage([coach], {
      content: "banner",
      incomplete: undefined,
    });
    expect(next[0].incomplete).toBeUndefined();
    expect("incomplete" in next[0]).toBe(true);
  });

  it("leaves the transcript alone when it is empty or the last message is the user's", () => {
    const empty: Msg[] = [];
    expect(patchLastCoachMessage(empty, { content: "x" })).toBe(empty);
    const theirs = [coach, user];
    expect(patchLastCoachMessage(theirs, { content: "x" })).toBe(theirs);
  });
});
