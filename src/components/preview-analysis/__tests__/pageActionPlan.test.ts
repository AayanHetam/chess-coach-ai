import { describe, expect, it } from "vitest";
import {
  coachAskedLast,
  markServedPageTurn,
  planPageTurn,
  type PageTurnState,
} from "../pageActionPlan";
import type { PageAction, PageTurn } from "@/lib/coach/pageActions";

/** Fixture 07: 8. Nc7+ forks king and rook; 20 plies, ending 10... e5. */
const SHORT =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8 Nxa8 Qxd1+ Kxd1 e5".split(
    " "
  );
/** Fischer v Spassky, 1972, game 6: 81 plies, 20. e4 d4, ending 41. Qf4. */
const LONG =
  "c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4 c5 Qa3 Rc8 Bb5 a6 dxc5 bxc5 O-O Ra7 Be2 Nd7 Nd4 Qf8 Nxe6 fxe6 e4 d4 f4 Qe7 e5 Rb8 Bc4 Kh8 Qh3 Nf8 b3 a5 f5 exf5 Rxf5 Nh7 Rcf1 Qd8 Qg3 Re7 h4 Rbb7 e6 Rbc7 Qe5 Qe8 a4 Qd8 R1f2 Qe8 R2f3 Qd8 Bd3 Qe8 Qe4 Nf6 Rxf6 gxf6 Rxf6 Kg8 Bc4 Kh8 Qf4".split(
    " "
  );
/** After 1. e4 e6 2. d4, Black to move: the page still labels its first move "1. d5". */
const ROOT = "rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2";
const ROOTED = "d5 exd5 exd5 Nf3 Nf6 Bd3".split(" ");

const state = (over: Partial<PageTurnState> = {}): PageTurnState => ({
  ply: 0,
  sans: SHORT,
  rootFen: null,
  moveSide: "w",
  playerSide: null,
  previousSide: null,
  sideEligible: true,
  orientation: "white",
  drill: null,
  exploring: null,
  jump: null,
  typedJump: null,
  replay: null,
  coachAsked: false,
  ...over,
});
const act = (a: PageAction): PageTurn => ({ type: "action", action: a });
const go = (moveNumber: number, color?: "w" | "b") =>
  act(
    color
      ? { kind: "go_to_move", moveNumber, color }
      : { kind: "go_to_move", moveNumber }
  );
const cursorTo = (ply: number) => [
  { type: "clear_preview" },
  { type: "clear_jump" },
  { type: "cursor", ply },
];

describe("go to move N", () => {
  it("is the coach's side's move N, the position after it, named with its side", () => {
    const w = planPageTurn(go(20), state({ sans: LONG, ply: 5 }));
    expect(w).toEqual({
      effects: cursorTo(39),
      ack: "Here's 20. e4, White's move 20.",
      mood: "wave",
      typedJump: { fromPly: 5, toPly: 39 },
    });
    const b = planPageTurn(go(20), state({ sans: LONG, moveSide: "b" }));
    expect(b?.effects).toEqual(cursorTo(40));
    expect(b?.ack).toBe("Here's 20... d4, Black's move 20.");
  });

  it("a side in the words wins over the coach's side", () => {
    expect(
      planPageTurn(go(20, "b"), state({ sans: LONG, moveSide: "w" }))?.effects
    ).toEqual(cursorTo(40));
    expect(
      planPageTurn(go(20, "w"), state({ sans: LONG, moveSide: "b" }))?.effects
    ).toEqual(cursorTo(39));
  });

  it("a side whose move N the game never reached gives way to the other side, as the anchor does", () => {
    // The game ends on White's 41st: Black has no move 41.
    const plan = planPageTurn(go(41), state({ sans: LONG, moveSide: "b" }));
    expect(plan?.effects).toEqual(cursorTo(81));
    expect(plan?.ack).toBe("Here's 41. Qf4, White's move 41.");
  });

  it("a side named in the words never gives way: past the end is refused", () => {
    expect(planPageTurn(go(41, "b"), state({ sans: LONG }))).toEqual({
      effects: [],
      ack: "The game ends at 41. Qf4.",
      mood: "nervous",
    });
  });

  it("a number the game does not have is refused in words, with nothing moved", () => {
    expect(planPageTurn(go(50), state({ sans: LONG }))).toEqual({
      effects: [],
      ack: "The game ends at 41. Qf4.",
      mood: "nervous",
    });
    expect(planPageTurn(go(0), state())).toEqual({
      effects: [],
      ack: "Moves are numbered from 1.",
      mood: "nervous",
    });
    // Fixture 07 ends on Black's 10th.
    expect(planPageTurn(go(11), state())?.ack).toBe(
      "The game ends at 10... e5."
    );
  });

  it("in a game set up from a position a numbered move is declined: the page's labels count from 1", () => {
    const plan = planPageTurn(
      go(3),
      state({ sans: ROOTED, rootFen: ROOT, ply: 1 })
    );
    expect(plan).toEqual({
      effects: [],
      ack: "This game starts from a set-up position, so its move numbers are its own. Pick the move in Moves instead.",
      mood: "nervous",
    });
  });

  it("the standard start written out is not a set-up position", () => {
    expect(
      planPageTurn(
        go(8),
        state({
          rootFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        })
      )?.ack
    ).toBe("Here's 8. Nc7+, White's move 8.");
  });

  it("leaves a line being explored and the coach's jump, even at the same ply", () => {
    const plan = planPageTurn(
      go(8),
      state({
        ply: 15,
        exploring: { anchorPly: 15, path: ["Kd8"] },
        jump: { fromPly: 3, toPly: 15 },
      })
    );
    expect(plan?.effects).toEqual(cursorTo(15));
  });
});

describe("the other moves through the game", () => {
  it("start and end, remembered for 'back'", () => {
    expect(
      planPageTurn(act({ kind: "go_to_start" }), state({ ply: 9 }))
    ).toEqual({
      effects: cursorTo(0),
      ack: "Back to the start.",
      mood: "wave",
      typedJump: { fromPly: 9, toPly: 0 },
    });
    expect(planPageTurn(act({ kind: "go_to_end" }), state({ ply: 9 }))).toEqual(
      {
        effects: cursorTo(20),
        ack: "Here's the last move, 10... e5.",
        mood: "wave",
        typedJump: { fromPly: 9, toPly: 20 },
      }
    );
  });

  it("a step names the move it lands on, and stops at either end in words", () => {
    expect(
      planPageTurn(act({ kind: "step", delta: 1 }), state({ ply: 14 }))
    ).toEqual({ effects: cursorTo(15), ack: "Here's 8. Nc7+.", mood: "wave" });
    expect(
      planPageTurn(act({ kind: "step", delta: -1 }), state({ ply: 16 }))?.ack
    ).toBe("Back to 8. Nc7+.");
    expect(
      planPageTurn(act({ kind: "step", delta: -1 }), state({ ply: 1 }))?.ack
    ).toBe("Back to the start.");
    expect(
      planPageTurn(act({ kind: "step", delta: -1 }), state({ ply: 0 }))
    ).toEqual({ effects: [], ack: "This is the start.", mood: "wave" });
    expect(
      planPageTurn(act({ kind: "step", delta: 1 }), state({ ply: 20 }))
    ).toEqual({ effects: [], ack: "That's the last move.", mood: "wave" });
  });

  it("a game with no moves leaves a line on the board for its start or its end", () => {
    const exploring = { anchorPly: 0, path: ["Qxf7#"] };
    for (const a of [act({ kind: "go_to_start" }), act({ kind: "go_to_end" })])
      expect(planPageTurn(a, state({ sans: [], exploring }))).toEqual({
        effects: [{ type: "clear_preview" }, { type: "cursor", ply: 0 }],
        ack: "Back to the start.",
        mood: "wave",
      });
    expect(
      planPageTurn(act({ kind: "go_to_start" }), state({ sans: [] }))?.ack
    ).toBe("Back to the start.");
  });

  it("a game with no moves says so instead of moving", () => {
    for (const a of [
      go(1),
      act({ kind: "go_to_end" }),
      act({ kind: "step", delta: 1 }),
      act({ kind: "back" }),
    ])
      expect(planPageTurn(a, state({ sans: [] }))).toEqual({
        effects: [],
        ack: "There are no moves in this game to step through.",
        mood: "nervous",
      });
  });

  it("in a set-up game the acknowledgement names the move, never a number", () => {
    expect(
      planPageTurn(
        act({ kind: "step", delta: 1 }),
        state({ sans: ROOTED, rootFen: ROOT, ply: 1 })
      )?.ack
    ).toBe("Here's the position after exd5.");
    expect(
      planPageTurn(
        act({ kind: "go_to_end" }),
        state({ sans: ROOTED, rootFen: ROOT })
      )?.ack
    ).toBe("Here's the last move, the position after Bd3.");
  });
});

describe("back", () => {
  it("is the strip's Back on a line being explored", () => {
    expect(
      planPageTurn(
        act({ kind: "back" }),
        state({ ply: 14, exploring: { anchorPly: 14, path: ["Qxc1", "Rb8"] } })
      )
    ).toEqual({
      effects: [{ type: "clear_preview" }, { type: "cursor", ply: 14 }],
      ack: "Back to 7... Qxc1.",
      mood: "wave",
    });
  });

  it("is the strip's Back on the coach's jump", () => {
    expect(
      planPageTurn(
        act({ kind: "back" }),
        state({ ply: 15, jump: { fromPly: 4, toPly: 15 } })
      )
    ).toEqual({
      effects: [{ type: "clear_jump" }, { type: "cursor", ply: 4 }],
      ack: "Back to 2... Nc6.",
      mood: "wave",
    });
  });

  it("right after a typed go-to, goes back to where it was typed from", () => {
    expect(
      planPageTurn(
        act({ kind: "back" }),
        state({ ply: 15, typedJump: { fromPly: 4, toPly: 15 } })
      )
    ).toEqual({
      effects: [{ type: "cursor", ply: 4 }],
      ack: "Back to 2... Nc6.",
      mood: "wave",
    });
    // Once the board has moved on, it is one move back.
    expect(
      planPageTurn(
        act({ kind: "back" }),
        state({ ply: 12, typedJump: { fromPly: 4, toPly: 15 } })
      )?.effects
    ).toEqual(cursorTo(11));
  });

  it("otherwise is one move back", () => {
    expect(planPageTurn(act({ kind: "back" }), state({ ply: 15 }))).toEqual({
      effects: cursorTo(14),
      ack: "Back to 7... Qxc1.",
      mood: "wave",
    });
  });

  it("'back to the game' leaves a line, and says so when there is nothing to leave", () => {
    expect(
      planPageTurn(
        act({ kind: "back_to_game" }),
        state({ ply: 14, exploring: { anchorPly: 14, path: ["Qxc1"] } })
      )?.effects
    ).toEqual([{ type: "clear_preview" }, { type: "cursor", ply: 14 }]);
    expect(
      planPageTurn(
        act({ kind: "back_to_game" }),
        state({ ply: 15, jump: { fromPly: 4, toPly: 15 } })
      )
    ).toEqual({
      effects: [],
      ack: "You're on the game already.",
      mood: "wave",
    });
  });
});

describe("the strip's own Back label, typed", () => {
  const backTo = (n: number): PageTurn =>
    act({ kind: "go_to_move", moveNumber: n, via: "back" });
  it("is that Back on a line being explored, whichever side's ply it is", () => {
    // "Back to move 7" over an exploration from after 7... Qxc1.
    expect(
      planPageTurn(
        backTo(7),
        state({ ply: 14, exploring: { anchorPly: 14, path: ["Qxc1"] } })
      )
    ).toEqual({
      effects: [{ type: "clear_preview" }, { type: "cursor", ply: 14 }],
      ack: "Back to 7... Qxc1.",
      mood: "wave",
    });
    expect(
      planPageTurn(
        backTo(7),
        state({
          ply: 13,
          moveSide: "b",
          exploring: { anchorPly: 13, path: ["Qxc1"] },
        })
      )?.effects
    ).toEqual([{ type: "clear_preview" }, { type: "cursor", ply: 13 }]);
  });

  it("is that Back on the coach's jump and in a drill", () => {
    expect(
      planPageTurn(
        backTo(10),
        state({ ply: 15, jump: { fromPly: 20, toPly: 15 } })
      )?.effects
    ).toEqual([{ type: "clear_jump" }, { type: "cursor", ply: 20 }]);
    expect(
      planPageTurn(
        backTo(7),
        state({ drill: { complete: false, savedPly: 14 } })
      )?.effects
    ).toEqual([{ type: "exit_drill" }]);
    expect(
      planPageTurn(
        act({ kind: "go_to_start", via: "back" }),
        state({ drill: { complete: false, savedPly: 0 } })
      )?.effects
    ).toEqual([{ type: "exit_drill" }]);
  });

  it("in a set-up game too, where the label counts from 1 like every label", () => {
    expect(
      planPageTurn(
        backTo(1),
        state({
          sans: ROOTED,
          rootFen: ROOT,
          ply: 2,
          exploring: { anchorPly: 2, path: ["Nc3"] },
        })
      )?.effects
    ).toEqual([{ type: "clear_preview" }, { type: "cursor", ply: 2 }]);
  });

  it("another number, a side named, or a plain 'go to' keeps its meaning", () => {
    const exploring = { anchorPly: 14, path: ["Qxc1"] };
    expect(
      planPageTurn(backTo(5), state({ ply: 14, exploring }))?.effects
    ).toEqual(cursorTo(9));
    expect(
      planPageTurn(
        act({ kind: "go_to_move", moveNumber: 7, color: "w", via: "back" }),
        state({ ply: 14, exploring })
      )?.effects
    ).toEqual(cursorTo(13));
    expect(planPageTurn(go(7), state({ ply: 14, exploring }))?.effects).toEqual(
      cursorTo(13)
    );
  });
});

describe("on a line being explored", () => {
  const exploring = { anchorPly: 14, path: ["Qxc1", "Rb8", "Qf4"] };
  it("one move back takes back one explored move; the last one is the strip's Back", () => {
    expect(
      planPageTurn(
        act({ kind: "step", delta: -1 }),
        state({ ply: 14, exploring })
      )
    ).toEqual({
      effects: [{ type: "step_back_line" }],
      ack: "One move back on the line.",
      mood: "wave",
    });
    expect(
      planPageTurn(
        act({ kind: "step", delta: -1 }),
        state({ ply: 14, exploring: { anchorPly: 14, path: ["Qxc1"] } })
      )?.effects
    ).toEqual([{ type: "clear_preview" }, { type: "cursor", ply: 14 }]);
  });

  it("one move forward stays put and says how to get back, whatever the game's ends", () => {
    expect(
      planPageTurn(
        act({ kind: "step", delta: 1 }),
        state({ ply: 20, exploring: { anchorPly: 20, path: ["Kc2"] } })
      )
    ).toEqual({
      effects: [],
      ack: "You're on a side line. Say “back” to return to the game.",
      mood: "wave",
    });
  });
});

describe("a drill owns the board", () => {
  const drill = { complete: false, savedPly: 14 };
  it("only a flip and leaving act; anything else is refused in words", () => {
    expect(
      planPageTurn(act({ kind: "flip_board" }), state({ drill }))?.effects
    ).toEqual([{ type: "orientation", to: "black" }]);
    for (const a of [
      go(8),
      act({ kind: "go_to_start" }),
      act({ kind: "step", delta: 1 }),
      act({ kind: "replay_line" }),
    ])
      expect(planPageTurn(a, state({ drill }))).toEqual({
        effects: [],
        ack: "You're in a drill. Say “back” to leave it first.",
        mood: "nervous",
      });
  });

  it("leaving an unfinished drill says nothing here: the drill posts its own line", () => {
    expect(planPageTurn(act({ kind: "back" }), state({ drill }))).toEqual({
      effects: [{ type: "exit_drill" }],
      ack: null,
      mood: "wave",
    });
  });

  it("leaving a finished one is acknowledged, and 'back to the game' leaves the line under it too", () => {
    expect(
      planPageTurn(
        act({ kind: "back_to_game" }),
        state({ drill: { complete: true, savedPly: 14 } })
      )
    ).toEqual({
      effects: [
        { type: "exit_drill" },
        { type: "clear_preview" },
        { type: "clear_jump" },
      ],
      ack: "Back to 7... Qxc1.",
      mood: "wave",
    });
  });
});

describe("flip", () => {
  it("toggles, or sets the side asked for, and names the side at the bottom", () => {
    expect(planPageTurn(act({ kind: "flip_board" }), state())).toEqual({
      effects: [{ type: "orientation", to: "black" }],
      ack: "Flipped. Black is at the bottom.",
      mood: "wave",
    });
    expect(
      planPageTurn(act({ kind: "flip_board" }), state({ orientation: "black" }))
        ?.ack
    ).toBe("Flipped. White is at the bottom.");
    expect(
      planPageTurn(act({ kind: "flip_board", to: "white" }), state())
    ).toEqual({
      effects: [],
      ack: "White is already at the bottom.",
      mood: "wave",
    });
  });
});

describe("play the line again", () => {
  it("plays the line the page names, from its first move", () => {
    expect(
      planPageTurn(
        act({ kind: "replay_line" }),
        state({ replay: { anchorPly: 14, firstSan: "Qxc1" } })
      )
    ).toEqual({
      effects: [{ type: "replay" }],
      ack: "Playing the line from 8. Qxc1.",
      mood: "wave",
    });
    expect(
      planPageTurn(
        act({ kind: "replay_line" }),
        state({
          sans: ROOTED,
          rootFen: ROOT,
          replay: { anchorPly: 1, firstSan: "Qxd5" },
        })
      )?.ack
    ).toBe("Playing the line from Qxd5.");
  });

  it("with no line says so, and plays nothing", () => {
    expect(planPageTurn(act({ kind: "replay_line" }), state())).toEqual({
      effects: [],
      ack: "There's no line to play yet. Press Play under a line and I can play it again.",
      mood: "nervous",
    });
  });
});

describe("the player's side", () => {
  const side = (color: "w" | "b", bare = false, declared = true): PageTurn => ({
    type: "preference",
    preference: { kind: "side", color, bare, declared },
  });
  const mySide: PageTurn = {
    type: "preference",
    preference: { kind: "my_side" },
  };

  it("answers the side ask, as its buttons do", () => {
    expect(planPageTurn(side("b", true), state())).toEqual({
      effects: [{ type: "side", color: "b" }],
      ack: "Coaching you as Black.",
      mood: "wave",
    });
  });

  it("a colour on its own is an answer only while the side is unknown and the coach asked nothing", () => {
    expect(
      planPageTurn(side("b", true), state({ playerSide: "w" }))
    ).toBeNull();
    // "Your turn: who is better, White or Black?" "Black": the coach's.
    expect(
      planPageTurn(side("b", true), state({ coachAsked: true }))
    ).toBeNull();
    // A statement is still a statement after a question.
    expect(
      planPageTurn(side("b"), state({ coachAsked: true }))?.effects
    ).toEqual([{ type: "side", color: "b" }]);
  });

  it("switches like the chip's Switch, or says it already coaches that side", () => {
    expect(planPageTurn(side("b"), state({ playerSide: "w" }))).toEqual({
      effects: [{ type: "side", color: "b" }],
      ack: "Coaching you as Black now.",
      mood: "wave",
    });
    expect(planPageTurn(side("w"), state({ playerSide: "w" }))).toEqual({
      effects: [],
      ack: "I'm coaching you as White already.",
      mood: "wave",
    });
    // A wish ("coach me as Black") keeps the side it replaces for "back to
    // my side"; a statement ("I was Black") is a correction and does not.
    expect(
      planPageTurn(side("b", false, false), state({ playerSide: "w" }))?.effects
    ).toEqual([{ type: "side", color: "b", remember: true }]);
  });

  it("'back to my side' undoes a switch, or says where things stand", () => {
    expect(
      planPageTurn(mySide, state({ playerSide: "b", previousSide: "w" }))
    ).toEqual({
      effects: [{ type: "side", color: "w", restore: true }],
      ack: "Coaching you as White again.",
      mood: "wave",
    });
    expect(
      planPageTurn(mySide, state({ playerSide: "b", orientation: "black" }))
        ?.ack
    ).toBe("I'm coaching you as Black already.");
    // Nothing to undo and the board flipped away: "my side" is the board's.
    expect(
      planPageTurn(mySide, state({ playerSide: "w", orientation: "black" }))
    ).toEqual({
      effects: [{ type: "orientation", to: "white" }],
      ack: "Back to your side. White is at the bottom.",
      mood: "wave",
    });
    expect(planPageTurn(mySide, state())).toEqual({
      effects: [],
      ack: "Which side did you play, White or Black?",
      mood: "wave",
    });
  });

  it("where no side can be picked (a puzzle, no moves) it is left to the coach", () => {
    expect(planPageTurn(side("b"), state({ sideEligible: false }))).toBeNull();
    expect(planPageTurn(mySide, state({ sideEligible: false }))).toBeNull();
  });
});

describe("no acknowledgement carries what the transcript would mangle", () => {
  it("none opens with a number, a 'Lesson:' or a 'Your turn:', and none has a dash or a semicolon", () => {
    const acks: string[] = [];
    const states = [
      state(),
      state({ ply: 15 }),
      state({ sans: LONG, ply: 40 }),
      state({ drill: { complete: true, savedPly: 3 } }),
      state({ exploring: { anchorPly: 4, path: ["Bb5", "a6"] }, ply: 4 }),
      state({ jump: { fromPly: 2, toPly: 15 }, ply: 15 }),
      state({ sans: ROOTED, rootFen: ROOT, ply: 2 }),
      state({ sans: [] }),
    ];
    const actions: PageAction[] = [
      { kind: "flip_board" },
      { kind: "go_to_move", moveNumber: 8 },
      { kind: "go_to_move", moveNumber: 99 },
      { kind: "go_to_start" },
      { kind: "go_to_end" },
      { kind: "step", delta: 1 },
      { kind: "step", delta: -1 },
      { kind: "back" },
      { kind: "back_to_game" },
      { kind: "replay_line" },
    ];
    for (const s of states)
      for (const a of actions) {
        const ack = planPageTurn(act(a), s)?.ack;
        if (ack) acks.push(ack);
      }
    expect(acks.length).toBeGreaterThan(50);
    for (const ack of acks) {
      expect(ack, ack).not.toMatch(/^\s*\d/);
      expect(ack, ack).not.toMatch(/^(?:Lesson|Your turn):/);
      expect(ack, ack).not.toMatch(/[—–;]/);
    }
  });
});

describe("markServedPageTurn", () => {
  type M = {
    role: "user" | "coach";
    content: string;
    synthetic?: boolean;
    pageTurn?: boolean;
  };
  it("drops the empty placeholder and makes the question the page's", () => {
    const before: M[] = [
      { role: "coach", content: "Hi." },
      { role: "user", content: "flip the board" },
      { role: "coach", content: "" },
    ];
    expect(markServedPageTurn(before)).toEqual([
      { role: "coach", content: "Hi." },
      {
        role: "user",
        content: "flip the board",
        synthetic: true,
        pageTurn: true,
      },
    ]);
  });

  it("leaves a coach message with words in it alone", () => {
    const before: M[] = [
      { role: "user", content: "x" },
      { role: "coach", content: "Drill left at puzzle 1 of 1." },
    ];
    expect(markServedPageTurn(before)).toEqual(before);
  });
});

describe("coachAskedLast", () => {
  it("is true when the coach's last words ask the player something", () => {
    expect(
      coachAskedLast([
        { role: "coach", content: "Review." },
        { role: "user", content: "why?" },
        {
          role: "coach",
          content: "Because.\n\nYour turn: after 8... Kd8, who is better?",
        },
      ])
    ).toBe(true);
    expect(
      coachAskedLast([{ role: "coach", content: "Which would you play?" }])
    ).toBe(true);
  });

  it("is false for the page's own lines and for a statement, and skips the empty placeholder", () => {
    expect(
      coachAskedLast([
        { role: "coach", content: "Who is better?" },
        {
          role: "coach",
          content: "Which side did you play, White or Black?",
          synthetic: true,
        },
      ])
    ).toBe(false);
    expect(
      coachAskedLast([{ role: "coach", content: "Take the queen." }])
    ).toBe(false);
    expect(
      coachAskedLast([
        { role: "coach", content: "Who is better?" },
        { role: "user", content: "x" },
        { role: "coach", content: "" },
      ])
    ).toBe(true);
    expect(coachAskedLast([])).toBe(false);
  });
});
