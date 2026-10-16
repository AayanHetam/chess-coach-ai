import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PlayerSideAsk,
  PlayerSideChip,
} from "@/components/preview-analysis/PlayerSideLine";

/**
 * The side question and the side line name the players (founder feedback
 * 2026-10-16): "White (hikaru)", because a reader knows which name is theirs
 * before they know which colour it had. The old line said where the side came
 * from instead ("your choice", "matched your username"), on every game.
 */

const NAMES = { white: "hikaru", black: "magnus" };
const noop = () => {};

const text = (html: string) =>
  html
    // Emotion inlines its <style> blocks in static markup.
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("PlayerSideAsk", () => {
  it("asks with both players named", () => {
    const html = renderToStaticMarkup(
      createElement(PlayerSideAsk, { names: NAMES, onChoose: noop })
    );
    expect(text(html)).toContain("Which side were you playing?");
    expect(text(html)).toContain("White (hikaru)");
    expect(text(html)).toContain("Black (magnus)");
    expect(html).toContain('aria-label="I was playing White (hikaru)"');
  });

  it("falls back to the colours when the game names nobody", () => {
    const html = renderToStaticMarkup(
      createElement(PlayerSideAsk, {
        names: { white: null, black: null },
        onChoose: noop,
      })
    );
    expect(text(html)).toContain("White");
    expect(text(html)).not.toContain("(");
  });
});

describe("PlayerSideChip", () => {
  it("names the coached side and the switch by player", () => {
    for (const source of [
      "username_match",
      "stored_choice",
      "user_choice",
    ] as const) {
      const html = renderToStaticMarkup(
        createElement(PlayerSideChip, {
          side: { color: "white", source },
          names: NAMES,
          onChoose: noop,
        })
      );
      expect(text(html)).toBe(
        "Coaching you as White (hikaru). Switch to Black (magnus)"
      );
    }
  });

  it("says nothing about how the side was decided", () => {
    const html = renderToStaticMarkup(
      createElement(PlayerSideChip, {
        side: { color: "black", source: "user_choice" },
        names: NAMES,
        onChoose: noop,
      })
    );
    expect(text(html)).not.toMatch(
      /your choice|matched your username|remembered/
    );
    expect(text(html)).toBe(
      "Coaching you as Black (magnus). Switch to White (hikaru)"
    );
  });

  it("has no switch without a handler", () => {
    const html = renderToStaticMarkup(
      createElement(PlayerSideChip, {
        side: { color: "white", source: "username_match" },
        names: NAMES,
      })
    );
    expect(text(html)).toBe("Coaching you as White (hikaru).");
  });
});
