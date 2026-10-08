import { describe, expect, it } from "vitest";
import {
  asksAboutMistakes,
  perspectiveFromWords,
  readPerspectiveField,
  resolveTurnSubject,
} from "../questionPerspective";

const words = (m: string, player: "w" | "b" = "w", confirmed = true) =>
  perspectiveFromWords(m, player, confirmed);

describe("perspectiveFromWords: a colour named", () => {
  it.each([
    ["from Black's side, what went wrong?", "b", "colour_view"],
    ["look at it from black's perspective", "b", "colour_view"],
    ["from Black’s point of view, was 20... Ka7 forced?", "b", "colour_view"],
    ["through White's eyes, is this lost?", "w", "colour_view"],
    ["put yourself in Black's shoes", "b", "colour_view"],
    ["what's Black's side of the story", "b", "colour_view"],
    ["black's perspective please", "b", "colour_view"],
    ["what was Black thinking with Ka7?", "b", "colour_thinking"],
    ["what's black going for here", "b", "colour_thinking_now"],
    ["whats black thinking", "b", "colour_thinking_now"],
    ["i dont get what black was thinking with Qxb2", "b", "colour_thinking"],
    ["from the black side, what went wrong?", "b", "colour_view"],
    ["where’d black go wrong?", "b", "colour_decision"],
    ["where black went wrong?", "b", "colour_decision"],
    ["why did black lose?", "b", "colour_decision"],
    ["how should black of played?", "b", "colour_should"],
    ["what black should have played on move 7?", "b", "colour_should"],
    ["what was the worst move by black?", "b", "colour_moments"],
    ["what does black want?", "b", "colour_decision_now"],
    ["what did Black miss?", "b", "colour_decision"],
    ["what did black do wrong", "b", "colour_decision"],
    ["where did Black go wrong?", "b", "colour_decision"],
    ["how did Black lose this?", "b", "colour_decision"],
    ["why did Black play Ka7?", "b", "colour_decision"],
    ["why didn't White take on c1?", "w", "colour_decision"],
    ["how should Black have played?", "b", "colour_should"],
    ["what should black have done on move 20", "b", "colour_should"],
    ["what should Black play here?", "b", "colour_should_now"],
    ["what was Black's worst move?", "b", "colour_moments"],
    ["show me blacks biggest mistakes", "b", "colour_moments"],
    ["Black's mistakes", "b", "colour_moments"],
    ["what were Black's best moves?", "b", "colour_best"],
    ["what is my opponent's best reply?", "b", "opponent_best"],
  ])("%s", (m, side, rule) => {
    expect(words(m)).toEqual({ side, rule });
  });

  it("a colour resolves whether or not the player's side is confirmed", () => {
    expect(words("from Black's side, what went wrong?", "w", false)).toEqual({
      side: "b",
      rule: "colour_view",
    });
  });

  it("names the player's own colour as the subject too", () => {
    expect(words("what was White's worst move?", "w")).toEqual({
      side: "w",
      rule: "colour_moments",
    });
  });
});

describe("perspectiveFromWords: the opponent named", () => {
  it.each([
    ["what was my opponent thinking?", "opponent_thinking"],
    ["what was the opponent planning on move 20", "opponent_thinking"],
    ["what was he thinking?", "opponent_thinking"],
    ["what were they going for", "opponent_thinking"],
    ["what did my opponent miss?", "opponent_decision"],
    ["why did my opponent play Ka7", "opponent_decision"],
    ["from my opponent's side, was it lost?", "opponent_view"],
    ["from the opponent's perspective how does this look", "opponent_view"],
    ["through his eyes", "opponent_view"],
    ["how should my opponent have played?", "opponent_should"],
    ["what was my opponent's biggest mistake?", "opponent_moments"],
    ["their mistakes", "opponent_moments"],
    ["from my opponents side, what went wrong?", "opponent_view"],
    ["my opponents biggest mistake?", "opponent_moments"],
    ["whats my opponent thinking", "opponent_thinking_now"],
  ])("%s (confirmed)", (m, rule) => {
    expect(words(m, "w")).toEqual({ side: "b", rule });
    expect(words(m, "b")).toEqual({ side: "w", rule });
  });

  it("needs a confirmed side: the server's colour is otherwise a guess", () => {
    expect(words("what was my opponent thinking?", "w", false)).toBeNull();
    expect(
      words("from my opponent's side, was it lost?", "b", false)
    ).toBeNull();
    expect(words("what was he thinking?", "w", false)).toBeNull();
  });
});

describe("perspectiveFromWords: the player's own side", () => {
  it.each([
    "back to my side, why was move 20 bad?",
    "and from my perspective?",
    "from my own point of view what should I learn",
  ])("%s", (m) => {
    expect(words(m, "b")).toEqual({ side: "b", rule: "player" });
  });

  it("needs a confirmed side too", () => {
    expect(
      words("back to my side, why was move 20 bad?", "b", false)
    ).toBeNull();
  });
});

describe("perspectiveFromWords: not a perspective", () => {
  it.each([
    "I was Black",
    "I played as Black",
    "coach me as Black",
    "what if Black plays Ka7 as white resigned",
    "let's switch sides",
    "swap sides and you play white",
    "why was move 20 bad?",
    "why was Black's move 20 bad?",
    "after Black's move 7, what should I have played?",
    "explain move 20 for black",
    "why did my bishop take Black's knight?",
    "my knight was strong in Black's side of the board",
    "is Black's king safe?",
    "what was my worst move?",
    "what was the best move here?",
    "Black resigned, was that too early?",
    "why did I play Ka7?",
    "what should I have played after my opponent's mistake?",
    "did I take advantage of Black's mistake?",
    "I missed my opponent's best move, why?",
    "my rooks were doubled, what were they aiming for?",
    "from black's side of the board my knight was strong",
    "",
  ])("%s", (m) => {
    expect(words(m)).toBeNull();
  });

  it("two sides named as subjects: no one side", () => {
    expect(
      words("compare White's worst move with Black's worst move")
    ).toBeNull();
    expect(
      words("from White's side, what was Black thinking on move 20?")
    ).toBeNull();
    expect(words("from Black's side, and then from my side?", "w")).toBeNull();
  });
});

describe("asksAboutMistakes", () => {
  it.each([
    "from Black's side, what went wrong?",
    "what was Black's worst move?",
    "how should Black have played?",
    "where did my opponent go wrong",
    "how did Black lose this?",
  ])("%s asks about mistakes", (m) => {
    expect(asksAboutMistakes(m)).toBe(true);
  });
  it.each([
    "what is Black's best move here?",
    "what was Black thinking?",
    "from Black's side, how does it look now?",
    "is black's last move a blunder?",
    "what were Black's best moves?",
  ])("%s does not", (m) => {
    expect(asksAboutMistakes(m)).toBe(false);
  });
});

describe("readPerspectiveField", () => {
  it.each([
    ["w", "w"],
    ["b", "b"],
    ["White", "w"],
    [" BLACK ", "b"],
  ])("%s", (raw, side) => {
    expect(readPerspectiveField(raw)).toBe(side);
  });
  it.each([undefined, null, "", "opponent", "player", 1, { side: "b" }, ["b"]])(
    "%s is no choice",
    (raw) => {
      expect(readPerspectiveField(raw)).toBeNull();
    }
  );
});

describe("resolveTurnSubject", () => {
  const base = { player: "w" as const, sideConfirmed: true };

  it("the words win over the field and the history", () => {
    expect(
      resolveTurnSubject({
        ...base,
        message: "back to my side, what went wrong?",
        field: "b",
      })
    ).toEqual({ side: "w", source: "words", rule: "player" });
    expect(
      resolveTurnSubject({
        ...base,
        message: "from Black's side?",
        field: "w",
        history: ["back to my side"],
      })
    ).toEqual({ side: "b", source: "words", rule: "colour_view" });
  });

  it("the field stands when the words name no side", () => {
    expect(
      resolveTurnSubject({ ...base, message: "and move 20?", field: "black" })
    ).toEqual({ side: "b", source: "field", rule: "field" });
  });

  it("a field equal to the player's side is no subject, and ends one the history carried", () => {
    expect(
      resolveTurnSubject({
        ...base,
        message: "and move 20?",
        field: "w",
        history: ["from Black's side, what went wrong?"],
      })
    ).toBeNull();
  });

  it("with no field, the latest side the kept history named carries over", () => {
    expect(
      resolveTurnSubject({
        ...base,
        message: "and what about move 7?",
        history: ["from Black's side, what went wrong?", "ok"],
      })
    ).toEqual({ side: "b", source: "history", rule: "colour_view" });
    // A later turn back to the player's side ends it.
    expect(
      resolveTurnSubject({
        ...base,
        message: "and move 7?",
        history: [
          "from Black's side, what went wrong?",
          "back to my side please",
        ],
      })
    ).toBeNull();
  });

  it("the history carries only a reading about the game played", () => {
    // A question about the board on screen does not carry over.
    for (const earlier of [
      "what is Black's best move?",
      "what should Black play here?",
      "from Black's side, how does it look now?",
    ])
      expect(
        resolveTurnSubject({
          ...base,
          message: "and move 7?",
          history: [earlier],
        }),
        earlier
      ).toBeNull();
  });

  it("a present-tense question about the board does not carry", () => {
    for (const earlier of [
      "what does black want?",
      "what is my opponent planning?",
    ])
      expect(
        resolveTurnSubject({
          ...base,
          message: "and move 9?",
          history: [earlier],
        }),
        earlier
      ).toBeNull();
  });

  it("a carry ended by a later turn stays ended", () => {
    for (const middle of [
      "back to me please, what did I do wrong?",
      "ok now my mistakes please",
      "what's White's best move here?",
    ])
      expect(
        resolveTurnSubject({
          ...base,
          message: "and what about the endgame?",
          history: ["from Black's side, what went wrong?", middle],
        }),
        middle
      ).toBeNull();
  });

  it("a continuation of the other side's answer keeps it", () => {
    for (const message of [
      "tell me more",
      "show me the line",
      "I don't understand, why was that so bad?",
    ])
      expect(
        resolveTurnSubject({
          ...base,
          message,
          history: ["from Black's side, what went wrong?"],
        }),
        message
      ).toEqual({ side: "b", source: "history", rule: "colour_view" });
  });

  it("a question in the first person, or naming the player's side, ends the carry", () => {
    for (const message of [
      "and how did White play?",
      "what about white?",
      "what should we play now?",
      "where did we go wrong?",
      "what's the best move here?",
    ])
      expect(
        resolveTurnSubject({
          ...base,
          message,
          history: ["from Black's side, what went wrong?"],
        }),
        message
      ).toBeNull();
    const history = ["from Black's side, what went wrong?"];
    for (const message of [
      "what should I play here?",
      "and my move 8?",
      "why did I lose?",
    ])
      expect(
        resolveTurnSubject({ ...base, message, history }),
        message
      ).toBeNull();
    // Unconfirmed too: "my side" cannot be read as a colour, but it ends
    // the other side's turn.
    expect(
      resolveTurnSubject({
        player: "w",
        sideConfirmed: false,
        message: "back to my side, why was move 8 bad?",
        history,
      })
    ).toBeNull();
    // "my opponent" is not the first person.
    expect(
      resolveTurnSubject({
        ...base,
        message: "and my opponent's queen?",
        history,
      })
    ).toEqual({ side: "b", source: "history", rule: "colour_view" });
  });

  it("nothing named anywhere: null", () => {
    expect(
      resolveTurnSubject({
        ...base,
        message: "why was move 20 bad?",
        history: ["hi"],
      })
    ).toBeNull();
    expect(
      resolveTurnSubject({ ...base, message: "why?", field: "sideways" })
    ).toBeNull();
  });

  it("an opponent phrase with the side unconfirmed falls back to the field", () => {
    expect(
      resolveTurnSubject({
        player: "w",
        sideConfirmed: false,
        message: "what was my opponent thinking?",
        field: "b",
      })
    ).toEqual({ side: "b", source: "field", rule: "field" });
  });
});
