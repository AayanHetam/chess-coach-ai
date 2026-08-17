import { describe, it, expect } from "vitest";
import { selectHistoryTarget } from "../historyTarget";

describe("selectHistoryTarget", () => {
  it("uses the platform whose rating we stored", () => {
    expect(
      selectHistoryTarget({
        platformRatingSource: "chesscom",
        lichessUsername: "lichy",
        chesscomUsername: "ccy",
      })
    ).toEqual({ platform: "chesscom", username: "ccy" });
  });

  it("falls back to the account that EXISTS when the preferred one does not", () => {
    // The bug: platformRatingSource / primaryPlatform are set from a past
    // lookup or a quiz answer and are never re-checked against which username
    // the profile actually holds. Picking the platform first and discovering
    // the username is missing afterwards reported "no_username" to a user who
    // had a perfectly good account linked on the other platform — their three
    // trend graphs silently became an "add your username" prompt.
    expect(
      selectHistoryTarget({
        platformRatingSource: "chesscom",
        lichessUsername: "lichy",
        chesscomUsername: undefined,
      })
    ).toEqual({ platform: "lichess", username: "lichy" });

    expect(
      selectHistoryTarget({
        primaryPlatform: "lichess",
        chesscomUsername: "ccy",
      })
    ).toEqual({ platform: "chesscom", username: "ccy" });
  });

  it("prefers the stored rating source over the quiz answer", () => {
    // The quiz records an intention; the lookup records a measurement.
    expect(
      selectHistoryTarget({
        platformRatingSource: "lichess",
        primaryPlatform: "chesscom",
        lichessUsername: "lichy",
        chesscomUsername: "ccy",
      })
    ).toEqual({ platform: "lichess", username: "lichy" });
  });

  it("treats a whitespace-only username as absent", () => {
    expect(
      selectHistoryTarget({
        platformRatingSource: "lichess",
        lichessUsername: "   ",
        chesscomUsername: "ccy",
      })
    ).toEqual({ platform: "chesscom", username: "ccy" });
  });

  it("trims the username it returns", () => {
    expect(selectHistoryTarget({ lichessUsername: "  spacey  " })).toEqual({
      platform: "lichess",
      username: "spacey",
    });
  });

  it("returns null only when there is genuinely no account", () => {
    expect(selectHistoryTarget({})).toBeNull();
    expect(
      selectHistoryTarget({ platformRatingSource: "chesscom" })
    ).toBeNull();
    expect(
      selectHistoryTarget({ lichessUsername: "", chesscomUsername: "  " })
    ).toBeNull();
  });
});
