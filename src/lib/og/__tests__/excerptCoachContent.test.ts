import { describe, it, expect } from "vitest";
import { excerptCoachContent } from "../excerptCoachContent";

describe("excerptCoachContent", () => {
  it("returns empty string for empty input", () => {
    expect(excerptCoachContent("")).toBe("");
  });

  it("strips [INSIGHT:...] tags including their inner content", () => {
    const raw =
      "Here's why. [INSIGHT:Knight gambit|Why|Black sees|Roles|attacker|Concept|sac] The sacrifice is sound.";
    const out = excerptCoachContent(raw);
    expect(out).not.toContain("INSIGHT");
    expect(out).not.toContain("[");
    expect(out).toContain("Here's why.");
  });

  it("strips markdown emphasis and code marks", () => {
    expect(excerptCoachContent("**bold** and _italic_ and `code` here.")).toBe(
      "bold and italic and code here.",
    );
  });

  it("strips markdown link wrappers but keeps the link text", () => {
    expect(
      excerptCoachContent("See [the Najdorf](https://example.com) for context."),
    ).toBe("See the Najdorf for context.");
  });

  it("strips list bullets and blockquote prefixes", () => {
    const raw = "- first point\n* second\n> quoted line";
    expect(excerptCoachContent(raw)).toBe("first point second quoted line");
  });

  it("keeps the full text when it fits under maxLen", () => {
    const raw =
      "The knight is well placed. White will likely castle next move.";
    const out = excerptCoachContent(raw, 200);
    expect(out).toBe(raw);
  });

  it("cuts at the latest sentence boundary that fits when text overflows", () => {
    // Three sentences; only the first two fit under maxLen=80.
    const raw =
      "The knight is well placed. White will likely castle kingside next move. Then attack the e-file with the major pieces.";
    const out = excerptCoachContent(raw, 80);
    expect(out).toBe("The knight is well placed. White will likely castle kingside next move.");
  });

  it("does not cut at very short fragments before a period", () => {
    // Sentence boundary at position 2 ("OK. ") would yield "OK." which
    // is uselessly short — should fall through to hard-truncate.
    const raw =
      "OK. " + "x".repeat(300);
    const out = excerptCoachContent(raw, 50);
    expect(out.length).toBeGreaterThan(5);
    expect(out).not.toBe("OK.");
  });

  it("hard-truncates with an ellipsis at a word boundary near the limit", () => {
    const raw =
      "this is a long sentence without any periods at all and it keeps going forever and ever and ever";
    const out = excerptCoachContent(raw, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith("…")).toBe(true);
    expect(out.endsWith(" …")).toBe(false); // no orphan space before ellipsis
  });

  it("collapses runs of whitespace and newlines", () => {
    expect(excerptCoachContent("a\n\nb   c\t\td")).toBe("a b c d");
  });

  it("strips markdown headers", () => {
    expect(excerptCoachContent("## Heading\nbody text here.")).toBe(
      "Heading body text here.",
    );
  });
});
