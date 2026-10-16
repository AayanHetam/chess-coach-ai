import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChessAccountsCard from "@/components/profile/ChessAccountsCard";

/**
 * /profile shows the usernames the load dialog saved, with the way to change
 * them a button away.
 */

const text = (html: string) =>
  html
    // Emotion inlines its <style> blocks in static markup.
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("ChessAccountsCard", () => {
  it("lists each platform's saved username", () => {
    const html = renderToStaticMarkup(
      createElement(ChessAccountsCard, {
        profile: { chesscomUsername: "hikaru", lichessUsername: "DrNyk" },
        onChange: () => {},
      })
    );
    expect(text(html)).toContain("Chess.com hikaru");
    expect(text(html)).toContain("Lichess DrNyk");
    expect(text(html)).toContain("Change");
  });

  it("says Not set for a platform with none", () => {
    const html = renderToStaticMarkup(
      createElement(ChessAccountsCard, {
        profile: { chesscomUsername: "hikaru" },
        onChange: () => {},
      })
    );
    expect(text(html)).toContain("Lichess Not set");
  });
});
